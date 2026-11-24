import { and, eq, isNull, sql } from 'drizzle-orm';
import { CLUB, PUBLIC_URL } from '../lib/club';
import { db, schema } from '../lib/db';
import { formatMeetingDate, formatTime } from '../lib/format';
import { claimRole, meetingRoles, releaseRole, roleLabel, upcomingMeetings } from '../lib/meetings';
import { numberedOpenRoles } from '../lib/messages';
import { guideForRole } from '../lib/roles';

const HELP = `*${CLUB.name} bot* — reply with:
• *roles* — open roles at the next meeting
• *take 4* — take role number 4
• *my* — your upcoming roles
• *drop* — give back your role
• *stop* / *start* — mute / unmute my messages`;

/** Direct-message commands. Returns the reply text. */
export async function handleCommand(phone: string, text: string): Promise<string | undefined> {
  const member = db.select().from(schema.members).where(eq(schema.members.phone, phone)).get();
  const [cmd, ...rest] = text.toLowerCase().split(/\s+/);
  const arg = rest.join(' ');

  if (!member) {
    if (cmd === 'iam' || (cmd === 'i' && rest[0] === 'am')) return linkPhone(phone, text.replace(/^i\s*am\s*/i, ''));
    return `Hi! I don't know this number yet. If you are a ${CLUB.name} member, reply *I am <your full name>* as written on tmclub.eu.`;
  }

  switch (cmd) {
    case 'stop':
      db.update(schema.members).set({ muted: true }).where(eq(schema.members.id, member.id)).run();
      return 'Muted. You will not get reminders or summaries anymore. Reply *start* to undo.';
    case 'start':
      db.update(schema.members).set({ muted: false }).where(eq(schema.members.id, member.id)).run();
      return 'Welcome back — reminders and summaries are on again.';
    case 'roles':
    case 'open':
      return listRoles();
    case 'take':
    case 'claim':
      return take(member.id, Number(arg));
    case 'my':
    case 'me':
      return myRoles(member.id);
    case 'drop':
    case 'cancel':
      return drop(member.id, arg ? Number(arg) : undefined);
    default:
      return HELP;
  }
}

function nextMeeting() {
  return upcomingMeetings(1).find((m) => m.status === 'scheduled' && m.startsAt.getTime() > Date.now());
}

function header(m: { startsAt: Date }) {
  return `${formatMeetingDate(m.startsAt)}, ${formatTime(m.startsAt)}`;
}

function listRoles() {
  const meeting = nextMeeting();
  if (!meeting) return 'No upcoming meeting found.';
  const open = numberedOpenRoles(meetingRoles(meeting.id));
  if (!open.length) return `All roles for ${header(meeting)} are taken. 🙌`;
  return `*Open roles — ${header(meeting)}*\n${open
    .map(({ n, role }) => `${n}. ${roleLabel(role)}`)
    .join('\n')}\n\nReply *take <number>* to sign up.`;
}

function take(memberId: number, n: number) {
  const meeting = nextMeeting();
  if (!meeting) return 'No upcoming meeting found.';
  const roles = meetingRoles(meeting.id);
  const role = Number.isInteger(n) ? roles[n - 1] : undefined;
  if (!role) return `I couldn't find role number ${Number.isNaN(n) ? '?' : n}. Reply *roles* for the list.`;
  const { error } = claimRole(role.id, memberId);
  if (error) return error;
  const guide = guideForRole(role.role);
  return `✅ You are *${roleLabel(role)}* on ${header(meeting)}.${
    guide ? `\nHow the role works: ${PUBLIC_URL}/roles/${guide.slug}` : ''
  }\nI'll remind you before the meeting.`;
}

function myRoles(memberId: number) {
  const lines = upcomingMeetings(4).flatMap((m) =>
    meetingRoles(m.id)
      .filter((r) => r.memberId === memberId)
      .map((r) => `• ${header(m)} — ${roleLabel(r)}`),
  );
  return lines.length ? `*Your upcoming roles*\n${lines.join('\n')}` : 'You have no upcoming roles. Reply *roles* to find one.';
}

function drop(memberId: number, n?: number) {
  const meeting = nextMeeting();
  if (!meeting) return 'No upcoming meeting found.';
  const roles = meetingRoles(meeting.id);
  const mine = roles.map((r, i) => ({ n: i + 1, r })).filter(({ r }) => r.memberId === memberId);
  if (!mine.length) return `You have no role on ${header(meeting)}.`;
  const target = n ? mine.find((m) => m.n === n) : mine.length === 1 ? mine[0] : undefined;
  if (!target) return `You have several roles:\n${mine.map(({ n, r }) => `${n}. ${roleLabel(r)}`).join('\n')}\nReply *drop <number>*.`;
  releaseRole(target.r.id, memberId);
  return `Done — ${roleLabel(target.r)} is free again. Thanks for letting us know!`;
}

/** Self-service number linking, only for members that don't have a number yet. */
function linkPhone(phone: string, name: string) {
  const match = db
    .select()
    .from(schema.members)
    .where(and(sql`lower(${schema.members.name}) = ${name.trim().toLowerCase()}`, isNull(schema.members.phone), eq(schema.members.isGuest, false)))
    .get();
  if (!match) return `I couldn't find a member called "${name.trim()}" without a number. Check the spelling on tmclub.eu or ask an officer.`;
  db.update(schema.members).set({ phone }).where(eq(schema.members.id, match.id)).run();
  return `Thanks ${match.name.split(' ')[0]}, you're connected! 🎉\n\n${HELP}`;
}

/** A tap on the group's role poll: claim the chosen role, free the previously chosen one. Reply goes by DM. */
export async function handlePollVote(phone: string, poll: typeof schema.polls.$inferSelect, option: number | null) {
  const member = db.select().from(schema.members).where(eq(schema.members.phone, phone)).get();
  if (!member) return `Thanks for voting! I don't know this number yet — reply *I am <your full name>* so I can sign you up.`;

  const prev = db
    .select()
    .from(schema.pollVotes)
    .where(and(eq(schema.pollVotes.pollId, poll.id), eq(schema.pollVotes.memberId, member.id)))
    .get();
  const chosen = option === null ? undefined : poll.spec.options[option];
  if (prev?.meetingRoleId && prev.meetingRoleId !== chosen?.meetingRoleId) releaseRole(prev.meetingRoleId, member.id);

  const save = (meetingRoleId: number | null) =>
    db.insert(schema.pollVotes)
      .values({ pollId: poll.id, memberId: member.id, meetingRoleId })
      .onConflictDoUpdate({ target: [schema.pollVotes.pollId, schema.pollVotes.memberId], set: { meetingRoleId } })
      .run();

  if (!chosen) {
    save(null);
    return prev?.meetingRoleId ? `Okay, I took you off that role again.` : undefined;
  }
  const { error } = claimRole(chosen.meetingRoleId, member.id);
  if (error) {
    save(null);
    return `Sorry, ${chosen.label}: ${error} Reply *roles* to see what's still open.`;
  }
  save(chosen.meetingRoleId);
  const guide = guideForRole(chosen.label.replace(/\s+\d+$/, ''));
  return `✅ You're *${chosen.label}*!${guide ? ` How it works: ${PUBLIC_URL}/roles/${guide.slug}` : ''}`;
}
