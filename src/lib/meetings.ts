import { and, asc, desc, eq, gte, inArray, isNull, ne } from 'drizzle-orm';
import { db, schema } from './db';
import type { Meeting, Member, MeetingRole } from './db/schema';
import { guideForRole } from './roles';

export type RoleWithMember = MeetingRole & { member: Member | null };

/** Meetings that haven't ended, soonest first (a meeting counts as upcoming until 6 h after start). */
export function upcomingMeetings(limit = 5): Meeting[] {
  return db
    .select()
    .from(schema.meetings)
    .where(and(ne(schema.meetings.status, 'finished'), gte(schema.meetings.startsAt, new Date(Date.now() - 6 * 3600_000))))
    .orderBy(asc(schema.meetings.startsAt))
    .limit(limit)
    .all();
}

/** The meeting the QR code / hub should show: a live one, else the next upcoming one, else the last one. */
export function currentMeeting(): Meeting | undefined {
  const live = db.select().from(schema.meetings).where(eq(schema.meetings.status, 'live')).get();
  if (live) return live;
  return (
    upcomingMeetings(1)[0] ??
    db.select().from(schema.meetings).orderBy(desc(schema.meetings.startsAt)).limit(1).get()
  );
}

export function getMeeting(id: number): Meeting | undefined {
  return db.select().from(schema.meetings).where(eq(schema.meetings.id, id)).get();
}

export function meetingRoles(meetingId: number): RoleWithMember[] {
  return db
    .select()
    .from(schema.meetingRoles)
    .leftJoin(schema.members, eq(schema.meetingRoles.memberId, schema.members.id))
    .where(eq(schema.meetingRoles.meetingId, meetingId))
    .orderBy(asc(schema.meetingRoles.id))
    .all()
    .map((r) => ({ ...r.meeting_roles, member: r.members }));
}

export function meetingGuests(meetingId: number): Member[] {
  return db
    .select({ m: schema.members })
    .from(schema.meetingGuests)
    .innerJoin(schema.members, eq(schema.meetingGuests.memberId, schema.members.id))
    .where(eq(schema.meetingGuests.meetingId, meetingId))
    .orderBy(asc(schema.meetingGuests.id))
    .all()
    .map((r) => r.m);
}

export function roleLabel(r: Pick<MeetingRole, 'role' | 'slot'>) {
  return r.slot > 0 ? `${r.role} ${r.slot}` : r.role;
}

export interface Participant {
  member: Member;
  /** Role labels this person holds in the meeting. */
  roles: string[];
}

/**
 * Everyone who can be timed / evaluated / voted for: role holders first, then all other members,
 * then guests of this meeting. Table Topics speakers are often people without a role.
 */
export function meetingParticipants(meetingId: number): { withRole: Participant[]; others: Member[]; guests: Member[] } {
  const byMember = new Map<number, Participant>();
  for (const r of meetingRoles(meetingId)) {
    if (!r.member) continue;
    const p = byMember.get(r.member.id) ?? { member: r.member, roles: [] };
    p.roles.push(roleLabel(r));
    byMember.set(r.member.id, p);
  }
  const guests = meetingGuests(meetingId);
  const taken = new Set([...byMember.keys(), ...guests.map((g) => g.id)]);
  const others = db
    .select()
    .from(schema.members)
    .where(eq(schema.members.isGuest, false))
    .orderBy(asc(schema.members.name))
    .all()
    .filter((m) => !taken.has(m.id));
  return { withRole: [...byMember.values()], others, guests };
}

/** Open slots of a meeting, in agenda order. Numbered so WhatsApp users can reply "take 3". */
export function openRoles(meetingId: number) {
  return meetingRoles(meetingId).filter((r) => !r.memberId);
}

export function speakersOf(meetingId: number) {
  return meetingRoles(meetingId).filter((r) => r.member && guideForRole(r.role)?.slug === 'speaker');
}

/** Put a member on a role slot here and queue the write to easy-Speak. */
export function claimRole(meetingRoleId: number, memberId: number): { error?: string; role?: MeetingRole } {
  const role = db.select().from(schema.meetingRoles).where(eq(schema.meetingRoles.id, meetingRoleId)).get();
  if (!role) return { error: 'This role no longer exists.' };
  if (role.memberId === memberId) return { role };
  if (role.memberId) return { error: 'Someone else took this role already.' };
  const member = db.select().from(schema.members).where(eq(schema.members.id, memberId)).get();
  if (!member?.tmUserId) return { error: 'Only club members registered on easy-Speak can take roles.' };
  // Conditional update so two people claiming at the same second can't both win.
  const res = db
    .update(schema.meetingRoles)
    .set({ memberId, pendingSync: true, confirmed: true })
    .where(and(eq(schema.meetingRoles.id, meetingRoleId), isNull(schema.meetingRoles.memberId)))
    .run();
  if (res.changes === 0) return { error: 'Someone else took this role already.' };
  db.insert(schema.tmJobs).values({ kind: 'assignRole', payload: { meetingRoleId, memberId } }).run();
  return { role: { ...role, memberId } };
}

/** Free a role the member holds and queue the easy-Speak update. */
export function releaseRole(meetingRoleId: number, memberId: number) {
  const res = db
    .update(schema.meetingRoles)
    .set({ memberId: null, pendingSync: true, confirmed: null })
    .where(and(eq(schema.meetingRoles.id, meetingRoleId), eq(schema.meetingRoles.memberId, memberId)))
    .run();
  if (res.changes) db.insert(schema.tmJobs).values({ kind: 'unassignRole', payload: { meetingRoleId, memberId } }).run();
  return res.changes > 0;
}

export function membersByIds(ids: number[]) {
  if (!ids.length) return [];
  return db.select().from(schema.members).where(inArray(schema.members.id, ids)).all();
}
