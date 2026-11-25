import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const id = () => integer('id').primaryKey({ autoIncrement: true });
const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

/** Club members (synced from easy-Speak) and guests (added here). */
export const members = sqliteTable('members', {
  id: id(),
  /** easy-Speak user id; null for guests. */
  tmUserId: text('tm_user_id').unique(),
  name: text('name').notNull(),
  /** Digits only, international format without "+", e.g. 46701234567. */
  phone: text('phone').unique(),
  email: text('email'),
  isGuest: integer('is_guest', { mode: 'boolean' }).notNull().default(false),
  /** Club offices as JSON array, e.g. ["President"]. */
  clubRoles: text('club_roles', { mode: 'json' }).$type<string[]>().notNull().default([]),
  /** Member said "stop" on WhatsApp. */
  muted: integer('muted', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
});

export const meetings = sqliteTable('meetings', {
  id: id(),
  tmMeetingId: text('tm_meeting_id').unique(),
  startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
  number: integer('number'),
  theme: text('theme'),
  wordOfTheDay: text('word_of_the_day'),
  venue: text('venue'),
  status: text('status', { enum: ['scheduled', 'live', 'finished'] }).notNull().default('scheduled'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  /** Set once the per-person WhatsApp summaries were put in the outbox. */
  summariesQueuedAt: integer('summaries_queued_at', { mode: 'timestamp_ms' }),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
});

export const meetingRoles = sqliteTable(
  'meeting_roles',
  {
    id: id(),
    meetingId: integer('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    /** Role name as easy-Speak prints it, e.g. "Speaker", "Timekeeper". */
    role: text('role').notNull(),
    slot: integer('slot').notNull().default(0),
    /** easy-Speak agenda-line id (only valid for this meeting). */
    roleItemId: text('role_item_id'),
    memberId: integer('member_id').references(() => members.id, { onDelete: 'set null' }),
    details: text('details'),
    confirmed: integer('confirmed', { mode: 'boolean' }),
    /** Claimed here but not yet written to easy-Speak; sync must not overwrite it. */
    pendingSync: integer('pending_sync', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [uniqueIndex('meeting_role_slot').on(t.meetingId, t.role, t.slot)],
);

/** Guests attending a meeting (members come from easy-Speak roles/attendance). */
export const meetingGuests = sqliteTable(
  'meeting_guests',
  {
    id: id(),
    meetingId: integer('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('meeting_guest').on(t.meetingId, t.memberId)],
);

/** One timed speech from the timer tool. */
export const timings = sqliteTable('timings', {
  id: id(),
  meetingId: integer('meeting_id')
    .notNull()
    .references(() => meetings.id, { onDelete: 'cascade' }),
  memberId: integer('member_id').references(() => members.id, { onDelete: 'set null' }),
  speakerName: text('speaker_name').notNull(),
  kind: text('kind').notNull(),
  label: text('label').notNull(),
  greenSec: integer('green_sec').notNull(),
  amberSec: integer('amber_sec').notNull(),
  redSec: integer('red_sec').notNull(),
  durationSec: integer('duration_sec').notNull(),
  createdAt: createdAt(),
});

/** Ah-counter tallies per speaker. */
export const fillerCounts = sqliteTable('filler_counts', {
  id: id(),
  meetingId: integer('meeting_id')
    .notNull()
    .references(() => meetings.id, { onDelete: 'cascade' }),
  memberId: integer('member_id').references(() => members.id, { onDelete: 'set null' }),
  speakerName: text('speaker_name').notNull(),
  counts: text('counts', { mode: 'json' }).$type<Record<string, number>>().notNull(),
  createdAt: createdAt(),
});

/** Anonymous written feedback from the audience. */
export const feedback = sqliteTable('feedback', {
  id: id(),
  meetingId: integer('meeting_id')
    .notNull()
    .references(() => meetings.id, { onDelete: 'cascade' }),
  memberId: integer('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  /** What the feedback is about, e.g. "Speech", "Table Topics", "Timekeeper". */
  about: text('about').notNull(),
  positive: text('positive'),
  improvement: text('improvement'),
  createdAt: createdAt(),
});

/** Recorded spoken evaluations (speech evaluator or general evaluator on a role). */
export const evaluations = sqliteTable('evaluations', {
  id: id(),
  meetingId: integer('meeting_id')
    .notNull()
    .references(() => meetings.id, { onDelete: 'cascade' }),
  memberId: integer('member_id')
    .notNull()
    .references(() => members.id, { onDelete: 'cascade' }),
  about: text('about').notNull(),
  evaluatorName: text('evaluator_name'),
  audioPath: text('audio_path').notNull(),
  transcript: text('transcript'),
  summary: text('summary'),
  status: text('status', { enum: ['processing', 'done', 'error'] }).notNull().default('processing'),
  error: text('error'),
  createdAt: createdAt(),
});

export const votes = sqliteTable(
  'votes',
  {
    id: id(),
    meetingId: integer('meeting_id')
      .notNull()
      .references(() => meetings.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    /** Random id kept in the voter's cookie: one vote per category per device. */
    voterKey: text('voter_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('one_vote').on(t.meetingId, t.category, t.voterKey)],
);

/** WhatsApp messages waiting to be sent by the worker. */
export const outbox = sqliteTable('outbox', {
  id: id(),
  /** "group" for the club group chat, otherwise a phone number (digits). */
  to: text('to').notNull(),
  body: text('body').notNull(),
  kind: text('kind').notNull(),
  meetingId: integer('meeting_id').references(() => meetings.id, { onDelete: 'set null' }),
  memberId: integer('member_id').references(() => members.id, { onDelete: 'set null' }),
  /** Makes scheduled messages idempotent: the scheduler may try to enqueue the same one every tick. */
  dedupeKey: text('dedupe_key').unique(),
  /** Phone numbers (digits) to @mention; the body must contain "@<digits>" for each. */
  mentions: text('mentions', { mode: 'json' }).$type<string[]>(),
  /** Send as a single-choice WhatsApp poll instead of text (body is the question). */
  poll: text('poll', { mode: 'json' }).$type<PollSpec>(),
  sendAfter: integer('send_after', { mode: 'timestamp_ms' }).notNull(),
  sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  createdAt: createdAt(),
});

/** Writes to easy-Speak, done by the worker (it owns the browser-backed session). */
export const tmJobs = sqliteTable('tm_jobs', {
  id: id(),
  kind: text('kind', { enum: ['assignRole', 'unassignRole'] }).notNull(),
  /** memberId = who the role was claimed by / released from, so outdated jobs can be recognised. */
  payload: text('payload', { mode: 'json' }).$type<{ meetingRoleId: number; memberId?: number }>().notNull(),
  status: text('status', { enum: ['pending', 'done', 'error'] }).notNull().default('pending'),
  error: text('error'),
  /** Temporary failures only; time blocked by Cloudflare / login doesn't count. */
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
});

export interface PollSpec {
  kind: 'roles';
  options: { label: string; meetingRoleId: number }[];
}

/** WhatsApp polls we sent; needed to decrypt and map incoming votes. */
export const polls = sqliteTable('polls', {
  id: id(),
  waMessageId: text('wa_message_id').notNull().unique(),
  meetingId: integer('meeting_id').references(() => meetings.id, { onDelete: 'cascade' }),
  /** Base64 32-byte secret the votes are encrypted with. */
  secret: text('secret').notNull(),
  spec: text('spec', { mode: 'json' }).$type<PollSpec>().notNull(),
  createdAt: createdAt(),
});

/** Current choice of each voter, so changing or retracting a vote frees the old role. */
export const pollVotes = sqliteTable(
  'poll_votes',
  {
    id: id(),
    pollId: integer('poll_id')
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    memberId: integer('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    meetingRoleId: integer('meeting_role_id'),
  },
  (t) => [uniqueIndex('poll_voter').on(t.pollId, t.memberId)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
});

export type Member = typeof members.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
export type MeetingRole = typeof meetingRoles.$inferSelect;
export type Timing = typeof timings.$inferSelect;
export type Evaluation = typeof evaluations.$inferSelect;
