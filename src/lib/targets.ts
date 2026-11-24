import { and, eq, isNotNull } from 'drizzle-orm';
import { db, schema } from './db';
import { meetingRoles, roleLabel } from './meetings';
import { guideForRole } from './roles';

export interface Target {
  memberId: number;
  name: string;
  /** What the feedback / vote is about: "Speech", "Table Topic", "Timekeeper"… */
  about: string;
  group: 'speaker' | 'tabletopic' | 'evaluator' | 'role';
}

/** People the audience can give feedback on or vote for, derived from roles and the timer log. */
export function meetingTargets(meetingId: number): Target[] {
  const out: Target[] = [];
  for (const r of meetingRoles(meetingId)) {
    if (!r.member) continue;
    const slug = guideForRole(r.role)?.slug;
    const group = slug === 'speaker' ? 'speaker' : slug === 'evaluator' ? 'evaluator' : 'role';
    out.push({ memberId: r.member.id, name: r.member.name, about: group === 'speaker' ? 'Speech' : roleLabel(r), group });
  }
  // Table Topics speakers are only known once the timekeeper has timed them.
  const tt = db
    .select({ memberId: schema.timings.memberId, name: schema.members.name })
    .from(schema.timings)
    .innerJoin(schema.members, eq(schema.timings.memberId, schema.members.id))
    .where(and(eq(schema.timings.meetingId, meetingId), eq(schema.timings.kind, 'tabletopic'), isNotNull(schema.timings.memberId)))
    .all();
  for (const t of tt) {
    if (!out.some((o) => o.memberId === t.memberId && o.group === 'tabletopic')) {
      out.push({ memberId: t.memberId!, name: t.name, about: 'Table Topic', group: 'tabletopic' });
    }
  }
  return out;
}
