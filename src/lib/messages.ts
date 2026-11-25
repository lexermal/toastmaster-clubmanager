/** WhatsApp message texts. WhatsApp formatting: *bold*, _italic_. */
import { MEETING_PAGE_URL, ROLES_URL } from './club';
import type { Meeting, Member } from './db/schema';
import { formatMeetingDate, formatTime } from './format';
import { roleLabel, type RoleWithMember } from './meetings';
import { guideForRole } from './roles';

const firstName = (m: Pick<Member, 'name'>) => m.name.split(/\s+/)[0];

export function hubUrl() {
  return MEETING_PAGE_URL;
}

function meetingLine(m: Meeting) {
  return `${formatMeetingDate(m.startsAt)}, ${formatTime(m.startsAt)}${m.venue ? ` · ${m.venue}` : ''}`;
}

/** Group chat, a few days before: who does what + open roles. */
export function openRolesCall(meeting: Meeting, roles: RoleWithMember[]) {
  const open = numberedOpenRoles(roles);
  const lines = [
    `🎤 *Next meeting: ${meetingLine(meeting)}*`,
    meeting.theme ? `Theme: _${meeting.theme}_` : '',
    '',
    ...roles.filter((r) => r.member).map((r) => `✅ ${roleLabel(r)}: ${r.member!.name}`),
    '',
    open.length
      ? `*Still open:*\n${open.map(({ n, role }) => `${n}. ${roleLabel(role)}`).join('\n')}\n\nWant one? Message me privately: *take <number>* (e.g. "take ${open[0].n}").`
      : 'All roles are taken — thank you! 🙌',
  ];
  return lines.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}

/**
 * Open roles numbered by their agenda position, not by position in the open list — so "take 4"
 * still means the same role after someone else claims another one.
 */
export function numberedOpenRoles(roles: RoleWithMember[]) {
  return roles.map((role, i) => ({ n: i + 1, role })).filter(({ role }) => !role.memberId);
}

/** Group chat, day of the meeting. */
export function meetingDayAnnouncement(meeting: Meeting, roles: RoleWithMember[]) {
  const speakers = roles.filter((r) => r.member && guideForRole(r.role)?.slug === 'speaker');
  return [
    `☀️ *Meeting today — ${formatTime(meeting.startsAt)}*${meeting.venue ? ` at ${meeting.venue}` : ''}`,
    meeting.theme ? `Theme: _${meeting.theme}_` : '',
    meeting.wordOfTheDay ? `Word of the day: *${meeting.wordOfTheDay}*` : '',
    speakers.length ? `\n*Speeches*\n${speakers.map((s) => `• ${s.member!.name}${s.details ? ` — ${s.details}` : ''}`).join('\n')}` : '',
    `\n*All links for tonight* (agenda and feedback):\n${hubUrl()}`,
    `\nBringing a friend? Guests are always welcome. See you there!`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function roleReminder(meeting: Meeting, role: RoleWithMember) {
  const guide = guideForRole(role.role);
  return [
    `Hi ${firstName(role.member!)} 👋`,
    `Reminder: you are *${roleLabel(role)}* at the meeting on ${meetingLine(meeting)}.`,
    guide ? `\n${guide.summary}\nHow the roles work: ${ROLES_URL}` : '',
    `\nCan't make it? Reply *drop* and I'll free the role for someone else.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function speechReminder(meeting: Meeting, role: RoleWithMember, evaluator: RoleWithMember | undefined, daysLeft: number) {
  return [
    `Hi ${firstName(role.member!)} 🎙️`,
    daysLeft > 1
      ? `Your speech is in ${daysLeft} days — ${meetingLine(meeting)}.`
      : `Your speech is tomorrow — ${meetingLine(meeting)}.`,
    role.details ? `Project: ${role.details}` : '',
    evaluator?.member ? `Your evaluator: *${evaluator.member.name}* — tell them your project goals.` : '',
    `\nTips & timing signals: ${ROLES_URL}`,
    daysLeft > 1 ? `Rehearse with a timer and aim for the middle of your window. You've got this!` : `Good luck!`,
  ]
    .filter(Boolean)
    .join('\n');
}
