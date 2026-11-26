import { eq } from 'drizzle-orm';
import type { MeetingDetails, TmClubClient, UserRef } from 'tmclub-api';
import { CLUB } from '../lib/club';
import { db, schema } from '../lib/db';
import { setSetting } from '../lib/settings';
import { wp, type WpAgendaItem, type WpMeeting, type WpRoleType } from '../lib/wordpress';
import { clubDay, clubTimeToDate, isMeetingWindow, nextWpSyncAt, type ScheduledMeeting } from './wpSchedule';

type Api = Pick<TmClubClient, 'getBoard' | 'getMeeting'>;

/** "Alex Weixler" → "Alex W.". This is the only form of a name that goes to the public website. */
export function shortName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * Local date and start time of a meeting. The time is the "HH:MM" in the text easy-Speak shows
 * ("Monday 7th December 2026 at 17:45", or "Montag 7th Dezember 2026 um 17:45" when the account uses
 * German), not `startsAt`: easy-Speak's embedded timestamp is two hours off (15:45 UTC for a 17:45
 * meeting in winter). That error is too small to change the day, so the date still comes from it.
 */
export function meetingDateTime(d: MeetingDetails): { date: string; time: string } | undefined {
  if (!d.startsAt) return undefined;
  const t = new Date(d.startsAt);
  const hhmm = d.dateText.match(/(\d{1,2}):(\d{2})(?!.*\d{1,2}:\d{2})/);
  const time = hhmm
    ? `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`
    : new Intl.DateTimeFormat('sv-SE', { timeZone: CLUB.timezone, hour: '2-digit', minute: '2-digit' }).format(t);
  return { date: clubDay(t), time };
}

// ---- Role mapping --------------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

/**
 * easy-Speak role (without "1st" in front or "1" at the end) → the WordPress agenda points it fills. Roles that
 * appear twice on the WordPress agenda (introduction + report) get the same person on both.
 * Roles not listed map to a WordPress role with the same name, if there is one.
 */
const ROLE_MAP: Record<string, string[]> = {
  [norm('President s Introduction')]: ["President's Introduction"],
  [norm('Table Topic Master')]: ['Table Topics Master'],
  [norm('Table Topics Master')]: ['Table Topics Master'],
  [norm('Table Topic Volunteer')]: ['Table Topic Speaker'],
  [norm('Table Topic Speaker')]: ['Table Topic Speaker'],
  [norm('Grammarian & Ah Counter')]: ['Grammarian and Ah-Counter Introduction', 'Grammarian and Ah-Counter Report'],
  [norm('Timekeeper')]: ['Timekeeper Introduction', 'Timekeeper Report'],
  [norm('General Evaluator')]: ['General Evaluator Introduction', 'General Evaluator'],
};

export interface RoleFill {
  roleTypeId: number;
  /** 1-based: the nth agenda item of that role type. */
  nth: number;
  person?: UserRef;
  details?: string;
}

/** What easy-Speak says should be on the WordPress agenda. */
export function roleFills(d: MeetingDetails, roleTypes: WpRoleType[]): RoleFill[] {
  const byName = new Map(roleTypes.map((r) => [norm(r.name), r]));
  const seen = new Map<string, number>();
  const out: RoleFill[] = [];
  for (const r of d.roles) {
    // easy-Speak numbers repeated roles "1st Speaker" or "Speaker 1", depending on the account's language.
    const numbered = r.role.match(/^(\d+)(?:st|nd|rd|th)\s+(.+)$/i) ?? r.role.match(/^(.+?)\s+(\d+)$/);
    const [label, n] = !numbered ? [r.role, undefined] : /^\d/.test(numbered[1]) ? [numbered[2], numbered[1]] : [numbered[1], numbered[2]];
    const base = norm(label);
    // Clubs that name every slot the same ("Speaker" ×3) are numbered by order instead.
    seen.set(base, (seen.get(base) ?? 0) + 1);
    const nth = n ? Number(n) : (r.slot ?? 0) > 0 ? r.slot! : seen.get(base)!;
    const targets = ROLE_MAP[base] ?? [base];
    for (const t of targets) {
      const type = byName.get(norm(t));
      if (type) out.push({ roleTypeId: type.id, nth, person: r.presenter, details: r.details });
    }
  }
  return out;
}

/** People easy-Speak lists for a meeting: everyone attending (in the room or online) plus all role holders. */
export function participants(d: MeetingDetails) {
  const people = new Map<string, UserRef>();
  for (const a of d.attendees) if (a.status === 'attending' || a.status === 'online') people.set(a.userId, a);
  for (const r of d.roles) if (r.presenter) people.set(r.presenter.userId, r.presenter);
  return [...people.values()];
}

// ---- Sync ----------------------------------------------------------------------------------------

/** The meetings the schedule cares about (today's and upcoming), from our own table. */
export function scheduledMeetings(): ScheduledMeeting[] {
  return db.select().from(schema.wpMeetings).all();
}

/** Next due sync, from the meetings we know about. */
export const nextSyncAfter = (last: number) => nextWpSyncAt(last, scheduledMeetings());

/**
 * Pushes easy-Speak to WordPress in three steps: meetings (date and start time), the people who go to
 * them (bumps their "last synced" in WordPress), then the roles on each agenda. Close to a meeting only
 * that day's meetings are synced, so the every-minute sync stays light.
 */
export async function syncToWordPress(api: Api, now = Date.now()) {
  const known = db.select().from(schema.wpMeetings).all();
  let details: MeetingDetails[];
  if (isMeetingWindow(now, known)) {
    // Today's meeting may already have left the sign-up board, so fetch it by id.
    const today = known.filter((m) => clubDay(m.startsAt) === clubDay(now));
    details = await Promise.all(today.map((m) => api.getMeeting(m.tmMeetingId)));
  } else {
    // The sign-up board only shows 4 meetings. Start from its first column and follow nextMeetingId to
    // reach every scheduled meeting; the last one has no nextMeetingId. The cap guards against a loop.
    const board = await api.getBoard();
    details = [];
    const seen = new Set<string>();
    let id: string | undefined = board.meetings[0]?.meetingId;
    while (id && !seen.has(id) && seen.size < 60) {
      seen.add(id);
      const d = await api.getMeeting(id);
      details.push(d);
      id = d.nextMeetingId;
    }
  }

  // 1. Meetings.
  const wpByDate = new Map((await wp.listMeetings('all', 200)).map((m) => [m.date, m]));
  const pairs: { d: MeetingDetails; meeting: WpMeeting }[] = [];
  for (const d of details) {
    const when = meetingDateTime(d);
    if (!when) continue;
    const mapped = known.find((k) => k.tmMeetingId === d.meetingId);
    let meeting = mapped ? await wp.getMeeting(mapped.wpMeetingId).catch(() => undefined) : undefined;
    meeting ??= wpByDate.get(when.date);
    if (!meeting) {
      // The standard agenda gives the roles below a line to land on.
      meeting = await wp.createMeeting({ date: when.date, time: when.time, template: 'standard' });
    } else if (meeting.date !== when.date || meeting.time !== when.time) {
      meeting = await wp.updateMeeting(meeting.id, { date: when.date, time: when.time });
    }
    pairs.push({ d, meeting });
  }

  // 2. Members: one call for everyone.
  const people = new Map<string, string>();
  for (const { d } of pairs) for (const p of participants(d)) people.set(p.userId, shortName(p.name));
  if (people.size) {
    await wp.syncMembers([...people].map(([tm_id, name]) => ({ tm_id, name })).filter((p) => p.name));
  }

  // 3. Roles.
  const roleTypes = await wp.listRoleTypes();
  for (const { d, meeting } of pairs) {
    const full = meeting.agenda ? meeting : await wp.getMeeting(meeting.id);
    const agenda = await applyRoles(full.id, full.agenda ?? [], roleFills(d, roleTypes));
    remember(d.meetingId, full, agenda, now);
  }

  setSetting('wp_last_sync', new Date(now).toISOString());
  setSetting('wp_sync_error', null);
}

/** Writes only what differs, so a sync without changes costs no writes. Returns the new agenda. */
async function applyRoles(meetingId: number, agenda: WpAgendaItem[], fills: RoleFill[]) {
  let items = [...agenda];
  for (const f of fills) {
    // Speakers added on the day by the timekeeper are not ours to change.
    const ofType = items.filter((i) => i.role_type_id === f.roleTypeId && !i.is_adhoc).sort((a, b) => a.position - b.position);
    const item = ofType[f.nth - 1];
    const person = f.person ? shortName(f.person.name) : '';
    if (!item) {
      // More slots on easy-Speak than on the agenda: only add a line when someone holds it.
      if (!person) continue;
      const after = ofType.at(-1) ?? items.filter((i) => i.role_type_id === f.roleTypeId).at(-1);
      const added = await wp.addAgendaItem(meetingId, { role_type_id: f.roleTypeId, person_name: person, after_item_id: after?.id });
      items = (await wp.getMeeting(meetingId)).agenda ?? [...items, added];
      continue;
    }
    const change: { person_name?: string; speech_title?: string } = {};
    if (item.person_name !== person) change.person_name = person;
    // Speech title from easy-Speak only fills an empty one: officers may have written a better one.
    if (item.category === 'speech' && person && f.details && !item.speech_title) change.speech_title = f.details;
    if (Object.keys(change).length) {
      const updated = await wp.updateAgendaItem(item.id, change);
      items = items.map((i) => (i.id === item.id ? { ...i, ...updated } : i));
    }
  }
  return items;
}

function remember(tmMeetingId: string, meeting: WpMeeting, agenda: WpAgendaItem[], now: number) {
  const startsAt = clubTimeToDate(meeting.date, meeting.time);
  const endsAt = new Date(startsAt.getTime() + agenda.reduce((s, i) => s + i.red_sec, 0) * 1000);
  const row = { tmMeetingId, wpMeetingId: meeting.id, startsAt, endsAt, syncedAt: new Date(now) };
  db.insert(schema.wpMeetings).values(row).onConflictDoUpdate({ target: schema.wpMeetings.tmMeetingId, set: row }).run();
}

/** Re-reads one WordPress meeting and updates its stored end (agenda may grow on the day). */
export async function refreshEnd(row: typeof schema.wpMeetings.$inferSelect) {
  const meeting = await wp.getMeeting(row.wpMeetingId);
  const endsAt = new Date(clubTimeToDate(meeting.date, meeting.time).getTime() + (meeting.agenda ?? []).reduce((s, i) => s + i.red_sec, 0) * 1000);
  db.update(schema.wpMeetings).set({ endsAt }).where(eq(schema.wpMeetings.id, row.id)).run();
  return { meeting, endsAt };
}
