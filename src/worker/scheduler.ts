import { and, eq, isNull, lt, ne } from 'drizzle-orm';
import { db, schema } from '../lib/db';
import { meetingRoles, upcomingMeetings } from '../lib/meetings';
import { meetingDayAnnouncement, openRolesCall, roleReminder, speechReminder } from '../lib/messages';
import { queueRolesPoll, queueSpeechPing } from '../lib/engagement';
import { enqueue } from '../lib/outbox';
import { guideForRole } from '../lib/roles';
import { getSetting } from '../lib/settings';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** When each automatic message goes out, relative to the meeting start. */
export const SCHEDULE = {
  openRolesCall: 4 * DAY,
  /** Random @mention for an open speech slot; a second draw if still open closer to the date. */
  speechPings: [6 * DAY, 3 * DAY],
  meetingDay: 8 * HOUR,
  speechEarly: 7 * DAY,
  speechLate: 1 * DAY,
  defaultRoleReminder: 3 * DAY,
  /** Don't send reminders this close to the start — it's too late to be useful. */
  minLeadTime: 2 * HOUR,
};

/**
 * Called every tick. Queues each message once its time has come; the dedupe key makes repeated
 * ticks no-ops, and a role that changes hands gets a fresh key (it includes the member id).
 */
export function queueDueMessages(now = Date.now()) {
  const groupReady = Boolean(getSetting('wa_group_jid'));

  for (const meeting of upcomingMeetings(4)) {
    if (meeting.status !== 'scheduled') continue;
    const start = meeting.startsAt.getTime();
    const untilStart = start - now;
    if (untilStart < SCHEDULE.minLeadTime) continue;
    const roles = meetingRoles(meeting.id);

    if (groupReady && untilStart <= SCHEDULE.openRolesCall) {
      enqueue({ to: 'group', kind: 'open-roles', meetingId: meeting.id, dedupeKey: `open-roles:${meeting.id}`, body: openRolesCall(meeting, roles) });
      queueRolesPoll(meeting, `roles-poll:${meeting.id}`);
    }
    SCHEDULE.speechPings.forEach((lead, i) => {
      // The n-th draw goes out once its lead time is reached and fewer than n pings were sent.
      if (!groupReady || untilStart > lead) return;
      if (countPings(meeting.id) <= i) queueSpeechPing(meeting);
    });
    if (groupReady && untilStart <= SCHEDULE.meetingDay) {
      enqueue({ to: 'group', kind: 'meeting-day', meetingId: meeting.id, dedupeKey: `meeting-day:${meeting.id}`, body: meetingDayAnnouncement(meeting, roles) });
    }

    for (const role of roles) {
      const member = role.member;
      if (!member?.phone || member.muted) continue;
      const guide = guideForRole(role.role);

      if (guide?.slug === 'speaker') {
        const evaluator = roles.find((r) => guideForRole(r.role)?.slug === 'evaluator' && r.slot === role.slot);
        if (untilStart <= SCHEDULE.speechLate) {
          enqueue({ to: member.phone, kind: 'speech-reminder', meetingId: meeting.id, memberId: member.id, dedupeKey: `speech-1d:${role.id}:${member.id}`, body: speechReminder(meeting, role, evaluator, 1) });
        } else if (untilStart <= SCHEDULE.speechEarly) {
          const days = Math.round(untilStart / DAY);
          enqueue({ to: member.phone, kind: 'speech-reminder', meetingId: meeting.id, memberId: member.id, dedupeKey: `speech-early:${role.id}:${member.id}`, body: speechReminder(meeting, role, evaluator, days) });
        }
        continue;
      }

      const lead = guide ? guide.remindDaysBefore * DAY : SCHEDULE.defaultRoleReminder;
      if (untilStart <= lead) {
        enqueue({ to: member.phone, kind: 'role-reminder', meetingId: meeting.id, memberId: member.id, dedupeKey: `role:${role.id}:${member.id}`, body: roleReminder(meeting, role) });
      }
    }
  }
}

function countPings(meetingId: number) {
  return db
    .select({ id: schema.outbox.id })
    .from(schema.outbox)
    .where(and(eq(schema.outbox.kind, 'speech-ping'), eq(schema.outbox.meetingId, meetingId)))
    .all().length;
}

/** Meetings nobody pressed "finish" on are closed 4 h after their start so summaries still go out. */
export function autoFinishMeetings(now = Date.now()) {
  db.update(schema.meetings)
    .set({ status: 'finished', finishedAt: new Date(now) })
    .where(and(ne(schema.meetings.status, 'finished'), lt(schema.meetings.startsAt, new Date(now - 4 * HOUR)), isNull(schema.meetings.finishedAt)))
    .run();
}
