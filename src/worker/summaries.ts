import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { summarizeAudienceFeedback, summarizeEvaluation, transcribe } from '../lib/ai';
import { CLUB, PUBLIC_URL, WEBSITE_URL } from '../lib/club';
import { db, schema } from '../lib/db';
import type { Meeting, Member } from '../lib/db/schema';
import { formatMeetingDate } from '../lib/format';
import { meetingGuests, meetingRoles, roleLabel, type RoleWithMember } from '../lib/meetings';
import { enqueue } from '../lib/outbox';
import { formatDuration, guideForRole, timingVerdict, VOTE_CATEGORIES } from '../lib/roles';
import { claimToken } from '../lib/tokens';

const MIN = 60_000;
/** Give the audience a few minutes to submit late feedback before summaries go out. */
const FEEDBACK_GRACE = 10 * MIN;
/** Don't wait for a stuck transcription forever. */
const TRANSCRIPTION_WAIT = 60 * MIN;

/** Transcribe + summarise recorded evaluations, one at a time. */
export async function processEvaluations() {
  const pending = db.select().from(schema.evaluations).where(eq(schema.evaluations.status, 'processing')).all();
  for (const ev of pending) {
    try {
      const member = db.select().from(schema.members).where(eq(schema.members.id, ev.memberId)).get();
      const transcript = ev.transcript ?? (await transcribe(ev.audioPath));
      db.update(schema.evaluations).set({ transcript }).where(eq(schema.evaluations.id, ev.id)).run();
      const summary = await summarizeEvaluation({ transcript, about: ev.about, name: member?.name ?? 'the speaker' });
      db.update(schema.evaluations).set({ summary, status: 'done', error: null }).where(eq(schema.evaluations.id, ev.id)).run();
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`[ai] evaluation ${ev.id} failed:`, error);
      db.update(schema.evaluations).set({ status: 'error', error }).where(eq(schema.evaluations.id, ev.id)).run();
    }
  }
}

export async function queueSummaries(now = Date.now()) {
  const due = db
    .select()
    .from(schema.meetings)
    .where(and(eq(schema.meetings.status, 'finished'), isNull(schema.meetings.summariesQueuedAt)))
    .all()
    .filter((m) => m.finishedAt && now - m.finishedAt.getTime() >= FEEDBACK_GRACE);

  for (const meeting of due) {
    const stillTranscribing = db
      .select()
      .from(schema.evaluations)
      .where(and(eq(schema.evaluations.meetingId, meeting.id), eq(schema.evaluations.status, 'processing')))
      .get();
    if (stillTranscribing && now - meeting.finishedAt!.getTime() < TRANSCRIPTION_WAIT) continue;

    // Mark first: if building one summary crashes we'd rather miss it than spam everyone each tick.
    db.update(schema.meetings).set({ summariesQueuedAt: new Date(now) }).where(eq(schema.meetings.id, meeting.id)).run();
    for (const { member, body } of await buildSummaries(meeting)) {
      enqueue({ to: member.phone!, kind: 'summary', meetingId: meeting.id, memberId: member.id, dedupeKey: `summary:${meeting.id}:${member.id}`, body });
    }
  }
}

/** One personal recap per participant who has a phone number and hasn't muted the bot. */
export async function buildSummaries(meeting: Meeting, opts: { ai?: boolean } = {}) {
  const useAi = opts.ai ?? true;
  const roles = meetingRoles(meeting.id);
  const guests = meetingGuests(meeting.id);
  const timings = db.select().from(schema.timings).where(eq(schema.timings.meetingId, meeting.id)).orderBy(asc(schema.timings.id)).all();
  const fillers = db.select().from(schema.fillerCounts).where(eq(schema.fillerCounts.meetingId, meeting.id)).all();
  const notes = db.select().from(schema.feedback).where(eq(schema.feedback.meetingId, meeting.id)).all();
  const evals = db.select().from(schema.evaluations).where(and(eq(schema.evaluations.meetingId, meeting.id), eq(schema.evaluations.status, 'done'))).all();
  const winners = voteWinners(meeting.id);
  const next = db.select().from(schema.meetings).where(gt(schema.meetings.startsAt, meeting.startsAt)).orderBy(asc(schema.meetings.startsAt)).get();
  const nextRoles = next ? meetingRoles(next.id) : [];

  const people = new Map<number, Member>();
  const add = (m: Member | null | undefined) => m && people.set(m.id, m);
  roles.forEach((r) => add(r.member));
  guests.forEach(add);
  const ids = [...timings, ...fillers, ...notes, ...evals].map((x) => x.memberId).filter((x): x is number => x != null);
  for (const id of new Set(ids)) add(db.select().from(schema.members).where(eq(schema.members.id, id)).get());

  const out: { member: Member; body: string }[] = [];
  for (const member of people.values()) {
    // Preview (ai: false) shows everyone, including people we can't message.
    if (useAi && (!member.phone || member.muted)) continue;
    const myRoles = roles.filter((r) => r.memberId === member.id);
    const myTimings = timings.filter((t) => t.memberId === member.id);
    const myFillers = fillers.filter((f) => f.memberId === member.id);
    const myNotes = notes.filter((n) => n.memberId === member.id);
    const myEvals = evals.filter((e) => e.memberId === member.id);
    const myWins = winners.filter((w) => w.memberId === member.id);

    const parts: string[] = [];
    parts.push(`*Your recap — ${CLUB.name}, ${formatMeetingDate(meeting.startsAt)}*`);
    parts.push(
      myRoles.length
        ? `Thank you for being *${myRoles.map(roleLabel).join('* and *')}* tonight! 🙏`
        : `Thank you for joining us${member.isGuest ? ' as a guest' : ''}! 🙏`,
    );

    if (myWins.length) parts.push(`🏆 The audience voted you *${myWins.map((w) => w.label).join('* and *')}*!`);

    if (myTimings.length) {
      parts.push(
        `⏱️ *Timing*\n${myTimings
          .map((t) => {
            const v = timingVerdict(t);
            const mark = v === 'ok' ? '✅ within time' : v === 'under' ? '⬇️ under time' : '⬆️ over time';
            return `• ${t.label}: *${formatDuration(t.durationSec)}* (${formatDuration(t.greenSec)}–${formatDuration(t.redSec)}) ${mark}`;
          })
          .join('\n')}`,
      );
    }

    for (const ev of myEvals) {
      parts.push(
        `🗣️ *Evaluation${ev.evaluatorName ? ` by ${ev.evaluatorName}` : ''}* — ${ev.about}\n${ev.summary}\n\n_Full transcript:_\n"${ev.transcript}"`,
      );
    }

    // Group audience notes by what they were about (speech, a role, table topic...).
    for (const about of new Set(myNotes.map((n) => n.about))) {
      const group = myNotes.filter((n) => n.about === about);
      const positives = group.map((n) => n.positive).filter((x): x is string => !!x?.trim());
      const improvements = group.map((n) => n.improvement).filter((x): x is string => !!x?.trim());
      let summary = '';
      if (useAi && group.length >= 3) summary = await summarizeAudienceFeedback({ about, positives, improvements }).catch(() => '');
      parts.push(
        [
          `💬 *Audience feedback — ${about}* (${group.length} anonymous note${group.length === 1 ? '' : 's'})`,
          summary,
          positives.length ? `👍 ${positives.join('\n👍 ')}` : '',
          improvements.length ? `💡 ${improvements.join('\n💡 ')}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }

    if (myFillers.length) {
      const total: Record<string, number> = {};
      for (const f of myFillers) for (const [w, c] of Object.entries(f.counts)) total[w] = (total[w] ?? 0) + c;
      const entries = Object.entries(total).filter(([, c]) => c > 0);
      parts.push(
        entries.length
          ? `🔢 *Filler words*: ${entries.map(([w, c]) => `${w} ×${c}`).join(', ')}`
          : `🔢 *Filler words*: none counted — impressive!`,
      );
    }

    if (member.isGuest) {
      parts.push(`🌱 *Enjoyed it?* Come again any time, or become a member: ${WEBSITE_URL}/membership/`);
    } else if (next) {
      parts.push(nextStepCta(member, myRoles, next, nextRoles));
    }

    out.push({ member, body: parts.join('\n\n') });
  }
  return out;
}

/** Offer the same role again (if open) and a recommended next step up the learning path. */
function nextStepCta(member: Member, myRoles: RoleWithMember[], next: Meeting, nextRoles: RoleWithMember[]) {
  const open = nextRoles.filter((r) => !r.memberId);
  const already = nextRoles.filter((r) => r.memberId === member.id);
  const date = formatMeetingDate(next.startsAt, { weekday: 'short' });
  if (already.length) return `➡️ See you on ${date} as *${already.map(roleLabel).join('* and *')}*!`;
  if (!open.length) return `➡️ Next meeting: ${date}. See you there!`;

  const link = (r: RoleWithMember) => `${PUBLIC_URL}/claim/${claimToken(member.id, r.id)}`;
  const lines = [`➡️ *Next meeting — ${date}*`];

  const again = open.find((r) => myRoles.some((m) => m.role === r.role));
  if (again) lines.push(`Take *${roleLabel(again)}* again: ${link(again)}`);

  const recommended = recommendRole(member.id, open.filter((r) => r !== again));
  if (recommended) lines.push(`${again ? 'Or try' : 'Recommended for you'}: *${roleLabel(recommended)}* — ${link(recommended)}`);
  if (!again && !recommended) lines.push(`Open roles: reply *roles*`);
  return lines.join('\n');
}

/** The open role one step above the hardest role this member has held so far. */
function recommendRole(memberId: number, open: RoleWithMember[]) {
  const history = db.select().from(schema.meetingRoles).where(eq(schema.meetingRoles.memberId, memberId)).all();
  const highest = Math.max(0, ...history.map((r) => guideForRole(r.role)?.level ?? 0));
  const scored = open
    .map((r) => ({ r, level: guideForRole(r.role)?.level }))
    .filter((x): x is { r: RoleWithMember; level: number } => x.level != null);
  if (!scored.length) return open[0];
  // Prefer the smallest step up; if nothing is above, the hardest one available.
  const above = scored.filter((x) => x.level > highest).sort((a, b) => a.level - b.level);
  return (above[0] ?? scored.sort((a, b) => b.level - a.level)[0]).r;
}

function voteWinners(meetingId: number) {
  const votes = db.select().from(schema.votes).where(eq(schema.votes.meetingId, meetingId)).all();
  return VOTE_CATEGORIES.flatMap((cat) => {
    const counts = new Map<number, number>();
    for (const v of votes.filter((v) => v.category === cat.key)) counts.set(v.memberId, (counts.get(v.memberId) ?? 0) + 1);
    const max = Math.max(0, ...counts.values());
    return max ? [...counts].filter(([, c]) => c === max).map(([memberId]) => ({ memberId, label: cat.label })) : [];
  });
}
