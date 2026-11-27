/** Group-chat nudges: the role poll and the random speaker ping. Used by the scheduler and admin buttons. */
import { and, eq, inArray, like } from 'drizzle-orm';
import { PUBLIC_URL, ROLES_URL } from './club';
import { db, schema } from './db';
import type { Meeting } from './db/schema';
import { formatMeetingDate } from './format';
import { meetingRoles, roleLabel } from './meetings';
import { enqueue } from './outbox';
import { guideForRole } from './roles';
import { claimToken } from './tokens';

/** WhatsApp allows at most 12 poll options. */
const MAX_POLL_OPTIONS = 12;

/** Queue a single-choice poll of the meeting's open roles. Returns false if nothing is open. */
export function queueRolesPoll(meeting: Meeting, dedupeKey?: string) {
  const open = meetingRoles(meeting.id).filter((r) => !r.memberId).slice(0, MAX_POLL_OPTIONS);
  if (!open.length) return false;
  enqueue({
    to: 'group',
    kind: 'roles-poll',
    meetingId: meeting.id,
    dedupeKey,
    body: `🙋 Pick your role for ${formatMeetingDate(meeting.startsAt, { weekday: 'short' })} — tap one, it’s yours`,
    poll: { kind: 'roles', options: open.map((r) => ({ label: roleLabel(r), meetingRoleId: r.id })) },
  });
  return true;
}

function openSpeakerSlots(meetingId: number) {
  return meetingRoles(meetingId)
    .map((role, i) => ({ n: i + 1, role }))
    .filter(({ role }) => !role.memberId && guideForRole(role.role)?.slug === 'speaker');
}

/**
 * Pick a member for an open speech slot: random among the five who haven't spoken for the longest
 * (never-spoken first). People already on this meeting's agenda or already pinged for it are skipped.
 */
export function pickSpeechCandidate(meetingId: number) {
  const roles = meetingRoles(meetingId);
  const busy = new Set(roles.map((r) => r.memberId).filter(Boolean));
  const pinged = new Set(
    db
      .select({ memberId: schema.outbox.memberId })
      .from(schema.outbox)
      .where(and(eq(schema.outbox.kind, 'speech-ping'), like(schema.outbox.dedupeKey, `speech-ping:${meetingId}:%`)))
      .all()
      .map((r) => r.memberId),
  );
  const candidates = db
    .select()
    .from(schema.members)
    .where(eq(schema.members.isGuest, false))
    .all()
    .filter((m) => m.phone && m.tmUserId && !m.muted && !busy.has(m.id) && !pinged.has(m.id));
  if (!candidates.length) return;

  const speeches = db
    .select({ memberId: schema.meetingRoles.memberId, role: schema.meetingRoles.role, startsAt: schema.meetings.startsAt })
    .from(schema.meetingRoles)
    .innerJoin(schema.meetings, eq(schema.meetingRoles.meetingId, schema.meetings.id))
    .where(inArray(schema.meetingRoles.memberId, candidates.map((c) => c.id)))
    .all()
    .filter((s) => guideForRole(s.role)?.slug === 'speaker' && s.startsAt.getTime() < Date.now());
  const lastSpeech = new Map<number, number>();
  for (const s of speeches) lastSpeech.set(s.memberId!, Math.max(lastSpeech.get(s.memberId!) ?? 0, s.startsAt.getTime()));

  const ranked = candidates.sort((a, b) => (lastSpeech.get(a.id) ?? 0) - (lastSpeech.get(b.id) ?? 0)).slice(0, 5);
  const member = ranked[Math.floor(Math.random() * ranked.length)];
  return { member, lastSpeechAt: lastSpeech.get(member.id) };
}

function since(ms: number | undefined) {
  if (!ms) return 'No speech on record yet — perfect time for one!';
  const weeks = Math.round((Date.now() - ms) / (7 * 24 * 3600_000));
  if (weeks < 2) return 'Your last speech was very recent — fancy another?';
  return weeks < 8 ? `Last speech: ${weeks} weeks ago.` : `Last speech: ${Math.round(weeks / 4.3)} months ago.`;
}

/** Publicly @mention a random member in the group for an open speech slot, plus a private claim link. */
export function queueSpeechPing(meeting: Meeting, dedupeSuffix = '') {
  const slot = openSpeakerSlots(meeting.id)[0];
  if (!slot) return { error: 'No open speech slot.' };
  const pick = pickSpeechCandidate(meeting.id);
  if (!pick) return { error: 'Nobody left to ping (members need a phone number).' };
  const { member, lastSpeechAt } = pick;
  const date = formatMeetingDate(meeting.startsAt, { weekday: 'short' });

  enqueue({
    to: 'group',
    kind: 'speech-ping',
    meetingId: meeting.id,
    memberId: member.id,
    dedupeKey: `speech-ping:${meeting.id}:${member.id}${dedupeSuffix}`,
    mentions: [member.phone!],
    body: [
      `🎲 *Random speaker draw!*`,
      `@${member.phone} — the dice picked you 🎤`,
      `*${roleLabel(slot.role)}* is still open on ${date}. ${since(lastSpeechAt)}`,
      `Up for it? Message me *take ${slot.n}*. Not this time? No worries — someone else gets the dice next.`,
    ].join('\n'),
  });
  enqueue({
    to: member.phone!,
    kind: 'speech-ping-dm',
    meetingId: meeting.id,
    memberId: member.id,
    dedupeKey: `speech-ping-dm:${meeting.id}:${member.id}${dedupeSuffix}`,
    body: `Hi ${member.name.split(' ')[0]}! One tap to take the speech slot on ${date}:\n${PUBLIC_URL}/claim/${claimToken(member.id, slot.role.id)}\n\nHow the roles work: ${ROLES_URL}`,
  });
  return { member };
}
