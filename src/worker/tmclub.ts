import { and, eq, gt, notInArray } from 'drizzle-orm';
import path from 'node:path';
import { TmClubClient, type MeetingDetails } from 'tmclub-api';
import { DATA_DIR, db, schema } from '../lib/db';
import { enqueue } from '../lib/outbox';
import { roleLabel } from '../lib/meetings';
import { setSetting } from '../lib/settings';

let client: Promise<TmClubClient> | undefined;

function tm() {
  const { TMCLUB_USER, TMCLUB_PASSWORD, TMCLUB_CLUB_ID } = process.env;
  if (!TMCLUB_USER || !TMCLUB_PASSWORD) throw new Error('TMCLUB_USER / TMCLUB_PASSWORD not set');
  client ??= TmClubClient.connect({
    username: TMCLUB_USER,
    password: TMCLUB_PASSWORD,
    clubId: TMCLUB_CLUB_ID || undefined,
    sessionFile: path.join(DATA_DIR, 'tmclub-session.json'),
  }).catch((e) => {
    client = undefined;
    throw e;
  });
  return client;
}

export const tmConfigured = () => Boolean(process.env.TMCLUB_USER && process.env.TMCLUB_PASSWORD);

function memberIdFor(user: { userId: string; name: string }) {
  const existing = db.select().from(schema.members).where(eq(schema.members.tmUserId, user.userId)).get();
  if (existing) return existing.id;
  return db.insert(schema.members).values({ tmUserId: user.userId, name: user.name }).returning().get().id;
}

/** Pull members and the next few meetings (with roles) from easy-Speak. */
export async function syncFromTmClub(meetingsAhead = 4) {
  const api = await tm();

  for (const m of await api.getMembers()) {
    db.insert(schema.members)
      .values({ tmUserId: m.userId, name: m.name, clubRoles: m.clubRoles })
      .onConflictDoUpdate({ target: schema.members.tmUserId, set: { name: m.name, clubRoles: m.clubRoles } })
      .run();
  }

  const board = await api.getBoard();
  for (const b of board.meetings.slice(0, meetingsAhead)) {
    upsertMeeting(await api.getMeeting(b.meetingId));
  }
  setSetting('tm_last_sync', new Date().toISOString());
  setSetting('tm_sync_error', null);
}

function upsertMeeting(d: MeetingDetails) {
  if (!d.startsAt) return;
  const values = {
    tmMeetingId: d.meetingId,
    startsAt: new Date(d.startsAt),
    number: d.meetingNumber ?? null,
    theme: d.theme ?? null,
    wordOfTheDay: d.wordOfTheDay ?? null,
    venue: d.venue ?? null,
    syncedAt: new Date(),
  };
  const meeting = db
    .insert(schema.meetings)
    .values(values)
    .onConflictDoUpdate({ target: schema.meetings.tmMeetingId, set: values })
    .returning()
    .get();

  // Non-officers don't see slot numbers for taken slots; derive them from the order on the page.
  const seen = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const r of d.roles) counts.set(r.role, (counts.get(r.role) ?? 0) + 1);

  const keptIds: number[] = [];
  for (const r of d.roles) {
    const nth = (seen.get(r.role) ?? 0) + 1;
    seen.set(r.role, nth);
    const slot = r.slot ?? r.volunteer?.slot ?? ((counts.get(r.role) ?? 1) > 1 ? nth : 0);
    const roleItemId = r.roleItemId ?? r.volunteer?.roleItemId ?? null;

    const existing = db
      .select()
      .from(schema.meetingRoles)
      .where(and(eq(schema.meetingRoles.meetingId, meeting.id), eq(schema.meetingRoles.role, r.role), eq(schema.meetingRoles.slot, slot)))
      .get();
    // A claim made here that hasn't reached easy-Speak yet wins over the stale page.
    if (existing?.pendingSync) {
      if (roleItemId && !existing.roleItemId) {
        db.update(schema.meetingRoles).set({ roleItemId }).where(eq(schema.meetingRoles.id, existing.id)).run();
      }
      keptIds.push(existing.id);
      continue;
    }
    const row = {
      meetingId: meeting.id,
      role: r.role,
      slot,
      // Keep a previously seen id: easy-Speak hides it for taken slots unless we're an officer.
      roleItemId: roleItemId ?? existing?.roleItemId ?? null,
      memberId: r.presenter ? memberIdFor(r.presenter) : null,
      details: r.details ?? null,
      confirmed: r.confirmed ?? null,
    };
    const saved = db
      .insert(schema.meetingRoles)
      .values(row)
      .onConflictDoUpdate({ target: [schema.meetingRoles.meetingId, schema.meetingRoles.role, schema.meetingRoles.slot], set: row })
      .returning()
      .get();
    keptIds.push(saved.id);
  }
  if (keptIds.length) {
    db.delete(schema.meetingRoles)
      .where(and(eq(schema.meetingRoles.meetingId, meeting.id), notInArray(schema.meetingRoles.id, keptIds)))
      .run();
  }
}

/** Push role claims / releases made via WhatsApp or claim links to easy-Speak. */
export async function processTmJobs() {
  const jobs = db.select().from(schema.tmJobs).where(eq(schema.tmJobs.status, 'pending')).all();
  if (!jobs.length) return;
  const api = await tm();

  for (const job of jobs) {
    const role = db.select().from(schema.meetingRoles).where(eq(schema.meetingRoles.id, job.payload.meetingRoleId)).get();
    const meeting = role && db.select().from(schema.meetings).where(eq(schema.meetings.id, role.meetingId)).get();
    try {
      if (!role || !meeting?.tmMeetingId) throw new Error('Role or meeting not found');
      if (!role.roleItemId) throw new Error('easy-Speak role id unknown — the sync account needs officer rights');
      if (job.kind === 'assignRole') {
        const member = role.memberId
          ? db.select().from(schema.members).where(eq(schema.members.id, role.memberId)).get()
          : undefined;
        if (!member?.tmUserId) throw new Error('Member has no easy-Speak id');
        await api.assignRole(meeting.tmMeetingId, role.roleItemId, role.slot, member.tmUserId);
      } else {
        await api.unassignRole(meeting.tmMeetingId, role.roleItemId, role.slot);
      }
      db.update(schema.tmJobs).set({ status: 'done' }).where(eq(schema.tmJobs.id, job.id)).run();
      // Only clear the flag if no newer job for this role is still waiting.
      const newer = db
        .select()
        .from(schema.tmJobs)
        .where(and(eq(schema.tmJobs.status, 'pending'), gt(schema.tmJobs.id, job.id)))
        .all()
        .some((j) => j.payload.meetingRoleId === role.id);
      if (!newer) db.update(schema.meetingRoles).set({ pendingSync: false }).where(eq(schema.meetingRoles.id, role.id)).run();
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`[tmclub] job ${job.id} failed:`, error);
      db.update(schema.tmJobs).set({ status: 'error', error }).where(eq(schema.tmJobs.id, job.id)).run();
      if (role && job.kind === 'assignRole' && role.memberId) {
        // Undo locally so the board matches easy-Speak again, and tell the member.
        db.update(schema.meetingRoles).set({ memberId: null, pendingSync: false }).where(eq(schema.meetingRoles.id, role.id)).run();
        const member = db.select().from(schema.members).where(eq(schema.members.id, role.memberId)).get();
        if (member?.phone) {
          enqueue({
            to: member.phone,
            kind: 'role-sync-failed',
            memberId: member.id,
            body: `Sorry, I couldn't register you as ${roleLabel(role)} on tmclub.eu. Please sign up there directly or ask an officer.`,
          });
        }
      } else if (role) {
        db.update(schema.meetingRoles).set({ pendingSync: false }).where(eq(schema.meetingRoles.id, role.id)).run();
      }
    }
  }
}
