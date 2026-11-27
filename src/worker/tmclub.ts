import { and, asc, eq, isNull, lte, notInArray, or } from 'drizzle-orm';
import path from 'node:path';
import { HumanVerificationError, TmClubClient, type MeetingDetails, type UserRef } from 'tmclub-api';
import { DATA_DIR, db, schema } from '../lib/db';
import type { Meeting, MeetingRole } from '../lib/db/schema';
import { formatTime } from '../lib/format';
import { roleLabel } from '../lib/meetings';
import { enqueue } from '../lib/outbox';
import { normalizePhone } from '../lib/phone';
import { alert, resetAlert } from '../lib/telegram';
import { getSetting, setSetting, type SettingKey } from '../lib/settings';

const MIN = 60_000;
/** Wait before retry n (temporary errors only); the last value repeats. */
const BACKOFF = [1, 5, 15, 60].map((m) => m * MIN);
/** ~6 hours of temporary failures before a job counts as permanently failed. */
const MAX_ATTEMPTS = 10;

let client: Promise<TmClubClient> | undefined;

function tm() {
  const { TMCLUB_USER, TMCLUB_PASSWORD, TMCLUB_CLUB_ID, TMCLUB_VERIFY_URL, TMCLUB_VERIFY_PORT } = process.env;
  if (!TMCLUB_USER || !TMCLUB_PASSWORD) throw new Error('TMCLUB_USER / TMCLUB_PASSWORD not set');
  client ??= TmClubClient.connect({
    username: TMCLUB_USER,
    password: TMCLUB_PASSWORD,
    clubId: TMCLUB_CLUB_ID || undefined,
    sessionFile: path.join(DATA_DIR, 'tmclub-session.json'),
    clearance: {
      onHumanVerification: ({ url, expiresAt }) => announceHumanCheck(url, expiresAt),
      verificationServer: { port: Number(TMCLUB_VERIFY_PORT) || 8732, publicUrl: TMCLUB_VERIFY_URL || undefined },
    },
  }).catch((e) => {
    client = undefined;
    throw e;
  });
  return client;
}

/** The shared, browser-backed easy-Speak session (also used by the WordPress sync and feedback e-mails). */
export const tmApi = () => tm();

export const tmConfigured = () => Boolean(process.env.TMCLUB_USER && process.env.TMCLUB_PASSWORD);

// ---- Health state ------------------------------------------------------------------------------

/** Cloudflare wants a human: show the link in admin and send it to the officers on WhatsApp. */
function announceHumanCheck(url: string, expiresAt: Date) {
  // Also in the log: with WhatsApp off (wordpress-only mode) this is the only place the link shows up.
  console.log(`[tmclub] human check needed: ${url} (valid until ${expiresAt.toISOString()})`);
  void alert(`human-check:${url}`, `tmclub.eu needs a human check (Cloudflare). Open ${url} and tick the box. Valid until ${formatTime(expiresAt)}.`, 0);
  setSetting('tm_state', 'needs-human');
  setSetting('tm_verify_url', url);
  const tokens: string[] = JSON.parse(getSetting('tm_verify_tokens') ?? '[]');
  setSetting('tm_verify_tokens', JSON.stringify([...tokens, new URL(url).pathname].slice(-50)));
  setSetting('tm_verify_expires', expiresAt.toISOString());
  for (const phone of adminPhones()) {
    enqueue({
      to: phone,
      kind: 'tm-human-check',
      dedupeKey: `tm-human-check:${url}:${phone}`,
      body: `⚠️ tmclub.eu needs a quick human check (Cloudflare "Verify you are human").\nOpen this link and tick the box: ${url}\nValid until ${formatTime(expiresAt)}. Until then, role sign-ups are queued and will be written to tmclub.eu afterwards.`,
    });
  }
}

function adminPhones() {
  return (process.env.ADMIN_PHONES ?? '')
    .split(',')
    .map((p) => normalizePhone(p))
    .filter((p): p is string => !!p);
}

type Failure = 'blocked' | 'temporary';

/**
 * Blocked = only a person can fix it (human check not solved, login rejected): pause everything.
 * Temporary = worth retrying by itself later (network, server errors).
 */
function classify(e: unknown): Failure {
  if (e instanceof HumanVerificationError) return 'blocked';
  const msg = e instanceof Error ? e.message : String(e);
  return /cloudflare|login failed/i.test(msg) ? 'blocked' : 'temporary';
}

function markBlocked(e: unknown) {
  const reason = e instanceof Error ? e.message : String(e);
  const wasBlocked = getSetting('tm_state') === 'blocked';
  setSetting('tm_state', 'blocked');
  setSetting('tm_state_reason', reason);
  if (!wasBlocked) {
    setSetting('tm_blocked_at', new Date().toISOString());
    const retry = process.env.WORKER_MODE === 'wordpress-only' ? 'It retries by itself in 6 hours, or open any earlier check link to get a fresh check right away.' : 'Press "Retry now" in the club admin.';
    void alert('tm-blocked', `tmclub.eu work is paused: ${reason}. ${retry}`, 0);
  }
  setSetting('tm_verify_url', null);
  setSetting('tm_verify_expires', null);
  if (!wasBlocked) {
    for (const phone of adminPhones()) {
      enqueue({
        to: phone,
        kind: 'tm-blocked',
        dedupeKey: `tm-blocked:${Date.now()}:${phone}`,
        body: `⚠️ tmclub.eu sync is paused: ${reason}\nRole sign-ups keep working and are queued. Press "Retry now" in the club admin when ready.`,
      });
    }
  }
}

function markOk() {
  const state = getSetting('tm_state');
  if (state === 'ok') return;
  if (state) void alert('tm-ok', 'tmclub.eu works again.', 0);
  setSetting('tm_state', 'ok');
  setSetting('tm_state_reason', null);
  setSetting('tm_verify_url', null);
  setSetting('tm_verify_expires', null);
}

/**
 * Called once per tmclub loop. Returns false while paused. The library makes failed human checks
 * sticky on purpose (new browsers make Cloudflare stricter), so only an admin's "Retry now" re-arms it.
 */
export async function tmReady() {
  // No web app (and so no "Retry now" button) in wordpress-only mode: retry a pause after 6 hours instead.
  const blockedAt = getSetting('tm_blocked_at');
  if (process.env.WORKER_MODE === 'wordpress-only' && getSetting('tm_state') === 'blocked' && blockedAt && Date.now() - Date.parse(blockedAt) > 6 * 3600_000) {
    setSetting('tm_reset_requested', '1');
  }
  if (getSetting('tm_reset_requested') === '1') {
    setSetting('tm_reset_requested', null);
    (await client?.catch(() => undefined))?.resetClearance();
    client = undefined; // also retries a rejected login with fresh credentials
    // Not "ok" yet: markOk() (and its "works again" alert) only after the next call really succeeds.
    if (getSetting('tm_state') === 'blocked') setSetting('tm_state', 'retrying');
    // Run a sync now, so a fresh check (or success) follows right away instead of at the next scheduled sync.
    setSetting('tm_sync_requested', '1');
  }
  return getSetting('tm_state') !== 'blocked';
}

/** Consecutive failures per task, for alerts. */
const failures = new Map<string, number>();
const ALERT_AFTER = 3;

/** Runs a tmclub task and updates the health state. Returns the failure kind, if any. */
export async function guarded(name: string, fn: () => Promise<unknown>, errorKey: SettingKey = 'tm_sync_error'): Promise<Failure | undefined> {
  try {
    await fn();
    markOk();
    if ((failures.get(name) ?? 0) >= ALERT_AFTER) {
      resetAlert(`failing:${name}`);
      void alert(`ok:${name}`, `${name} works again.`, 0);
    }
    failures.set(name, 0);
  } catch (e) {
    const kind = classify(e);
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[tmclub] ${name} failed (${kind}):`, msg);
    if (kind === 'blocked') markBlocked(e);
    else setSetting(errorKey, msg);
    // One failed run is usually a hiccup (the free WordPress host is flaky); a few in a row are worth a message.
    const n = (failures.get(name) ?? 0) + 1;
    failures.set(name, n);
    if (kind === 'temporary' && n >= ALERT_AFTER) void alert(`failing:${name}`, `${name} failed ${n} times in a row: ${msg}`);
    return kind;
  }
}

// ---- Sync --------------------------------------------------------------------------------------

function memberIdFor(user: UserRef) {
  const existing = db.select().from(schema.members).where(eq(schema.members.tmUserId, user.userId)).get();
  if (existing) return existing.id;
  return db.insert(schema.members).values({ tmUserId: user.userId, name: user.name }).returning().get().id;
}

/**
 * Role lines with a stable slot number. Non-officers don't see slot numbers for taken slots,
 * so they're derived from the order on the page ("Speaker" ×3 → 1, 2, 3).
 */
function slotsOf(d: MeetingDetails) {
  const seen = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const r of d.roles) counts.set(r.role, (counts.get(r.role) ?? 0) + 1);
  return d.roles.map((r) => {
    const nth = (seen.get(r.role) ?? 0) + 1;
    seen.set(r.role, nth);
    return {
      ...r,
      slot: r.slot ?? r.volunteer?.slot ?? ((counts.get(r.role) ?? 1) > 1 ? nth : 0),
      roleItemId: r.roleItemId ?? r.volunteer?.roleItemId,
    };
  });
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
  for (const b of board.meetings.slice(0, meetingsAhead)) upsertMeeting(await api.getMeeting(b.meetingId));
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

  const keptIds: number[] = [];
  for (const r of slotsOf(d)) {
    const existing = db
      .select()
      .from(schema.meetingRoles)
      .where(and(eq(schema.meetingRoles.meetingId, meeting.id), eq(schema.meetingRoles.role, r.role), eq(schema.meetingRoles.slot, r.slot)))
      .get();
    // A claim made here that hasn't reached easy-Speak yet wins over the (older) page.
    if (existing?.pendingSync) {
      if (r.roleItemId && !existing.roleItemId) {
        db.update(schema.meetingRoles).set({ roleItemId: r.roleItemId }).where(eq(schema.meetingRoles.id, existing.id)).run();
      }
      keptIds.push(existing.id);
      continue;
    }
    const row = {
      meetingId: meeting.id,
      role: r.role,
      slot: r.slot,
      // Keep a previously seen id: easy-Speak hides it for taken slots unless we're an officer.
      roleItemId: r.roleItemId ?? existing?.roleItemId ?? null,
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

// ---- Role write-back queue ---------------------------------------------------------------------

type Job = typeof schema.tmJobs.$inferSelect;

/** A job that can never succeed: undo it locally and tell the member. */
class PermanentError extends Error {}

function finish(job: Job, status: 'done' | 'error', error?: string) {
  db.update(schema.tmJobs).set({ status, error: error ?? null }).where(eq(schema.tmJobs.id, job.id)).run();
  const stillQueued = db
    .select()
    .from(schema.tmJobs)
    .where(eq(schema.tmJobs.status, 'pending'))
    .all()
    .some((j) => j.payload.meetingRoleId === job.payload.meetingRoleId);
  if (!stillQueued) {
    db.update(schema.meetingRoles).set({ pendingSync: false }).where(eq(schema.meetingRoles.id, job.payload.meetingRoleId)).run();
  }
}

/**
 * Push role claims / releases to easy-Speak. Jobs may wait hours (e.g. while the human check is
 * pending), so each one first re-reads the slot on easy-Speak and only writes what is still needed.
 */
export async function processTmJobs(now = Date.now(), getApi: () => Promise<Pick<TmClubClient, 'getMeeting' | 'assignRole' | 'unassignRole'>> = tm) {
  const jobs = db
    .select()
    .from(schema.tmJobs)
    .where(and(eq(schema.tmJobs.status, 'pending'), or(isNull(schema.tmJobs.nextAttemptAt), lte(schema.tmJobs.nextAttemptAt, new Date(now)))))
    .orderBy(asc(schema.tmJobs.id))
    .all();
  if (!jobs.length) return;
  const api = await getApi();
  /** Fresh easy-Speak state per meeting, re-read once per run and updated after each write. */
  const fresh = new Map<string, MeetingDetails>();
  const touched = new Set<string>();

  for (const job of jobs) {
    const role = db.select().from(schema.meetingRoles).where(eq(schema.meetingRoles.id, job.payload.meetingRoleId)).get();
    const meeting = role && db.select().from(schema.meetings).where(eq(schema.meetings.id, role.meetingId)).get();
    try {
      if (!role || !meeting?.tmMeetingId) throw new PermanentError('Role or meeting no longer exists');
      // Nothing to fix and nobody to tell once the meeting is over.
      if (meeting.startsAt.getTime() < now) {
        finish(job, 'error', 'Meeting already took place');
        continue;
      }
      const details = fresh.get(meeting.tmMeetingId) ?? (await api.getMeeting(meeting.tmMeetingId));
      fresh.set(meeting.tmMeetingId, details);
      touched.add(meeting.tmMeetingId);
      const updated = await applyJob(api, job, role, meeting, details);
      if (updated) fresh.set(meeting.tmMeetingId, updated);
      finish(job, 'done');
    } catch (e) {
      if (e instanceof PermanentError) {
        console.error(`[tmclub] job ${job.id} dropped:`, e.message);
        finish(job, 'error', e.message);
        if (role && job.kind === 'assignRole') undoClaim(role, job, e.message);
        continue;
      }
      const kind = classify(e);
      if (kind === 'blocked') throw e; // pause the whole queue; the job keeps its place
      const attempts = job.attempts + 1;
      const error = e instanceof Error ? e.message : String(e);
      if (attempts >= MAX_ATTEMPTS) {
        finish(job, 'error', error);
        if (role && job.kind === 'assignRole') undoClaim(role, job, error);
      } else {
        const wait = BACKOFF[Math.min(attempts - 1, BACKOFF.length - 1)];
        db.update(schema.tmJobs).set({ attempts, error, nextAttemptAt: new Date(now + wait) }).where(eq(schema.tmJobs.id, job.id)).run();
      }
    }
  }
  // Bring the local board in line with what easy-Speak now shows.
  for (const id of touched) {
    const d = fresh.get(id);
    if (d) upsertMeeting(d);
  }
}

/** Returns the meeting as easy-Speak shows it after the write, or undefined if nothing was written. */
async function applyJob(api: Pick<TmClubClient, 'assignRole' | 'unassignRole'>, job: Job, role: MeetingRole, meeting: Meeting, details: MeetingDetails) {
  const slot = slotsOf(details).find((s) => s.role === role.role && s.slot === role.slot);
  if (!slot) throw new PermanentError(`${roleLabel(role)} is no longer on the agenda`);
  const roleItemId = slot.roleItemId ?? role.roleItemId;
  const occupant = slot.presenter?.userId;
  const jobMember = job.payload.memberId ?? role.memberId;
  const member = jobMember ? db.select().from(schema.members).where(eq(schema.members.id, jobMember)).get() : undefined;

  if (job.kind === 'assignRole') {
    // Released again before we got to it: a later unassign job covers it (or nothing is needed).
    if (role.memberId !== jobMember) return;
    if (!member?.tmUserId) throw new PermanentError('Member has no tmclub.eu account');
    if (occupant === member.tmUserId) return;
    if (occupant) throw new PermanentError(`${slot.presenter!.name} took this role on tmclub.eu in the meantime`);
    if (!roleItemId) throw new PermanentError('tmclub.eu hides this role — the sync account needs officer rights');
    return api.assignRole(meeting.tmMeetingId!, roleItemId, role.slot, member.tmUserId);
  }

  // Only remove the person we put there — never someone who signed up on tmclub.eu since.
  if (!occupant || occupant !== member?.tmUserId) return;
  if (!roleItemId) throw new PermanentError('tmclub.eu hides this role — the sync account needs officer rights');
  return api.unassignRole(meeting.tmMeetingId!, roleItemId, role.slot);
}

function undoClaim(role: MeetingRole, job: Job, reason: string) {
  const memberId = job.payload.memberId ?? role.memberId;
  if (!memberId) return;
  db.update(schema.meetingRoles)
    .set({ memberId: null, pendingSync: false })
    .where(and(eq(schema.meetingRoles.id, role.id), eq(schema.meetingRoles.memberId, memberId)))
    .run();
  const member = db.select().from(schema.members).where(eq(schema.members.id, memberId)).get();
  if (!member?.phone || member.muted) return;
  enqueue({
    to: member.phone,
    kind: 'role-sync-failed',
    memberId: member.id,
    dedupeKey: `role-sync-failed:${job.id}`,
    body: `Sorry, I couldn't put you down as *${roleLabel(role)}* on tmclub.eu (${reason}). Reply *roles* to see what's still open.`,
  });
}
