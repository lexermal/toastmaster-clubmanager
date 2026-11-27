import { existsSync } from 'node:fs';

// Same .env as the web app; in Docker the variables come from the environment instead.
if (existsSync('.env')) process.loadEnvFile('.env');

const { and, asc, eq, lte, lt, isNull } = await import('drizzle-orm');
const { db, schema } = await import('../lib/db');
const { getSetting, setSetting } = await import('../lib/settings');
const { handleCommand, handlePollVote } = await import('./commands');
const { autoFinishMeetings, queueDueMessages } = await import('./scheduler');
const { queueSummaries } = await import('./summaries');
const { guarded, processTmJobs, syncFromTmClub, tmApi, tmConfigured, tmReady } = await import('./tmclub');
const { wpConfigured } = await import('../lib/wordpress');
const { alert } = await import('../lib/telegram');
const { startVerifyGateway } = await import('./verifyGateway');
const { nextSyncAfter, syncToWordPress } = await import('./wpSync');
const { sendFeedbackEmails } = await import('./feedbackEmails');
const { isWhatsAppReady, refreshGroups, sendWhatsApp, startWhatsApp } = await import('./whatsapp');

/**
 * "wordpress-only" (alpha test): the worker only reads tmclub.eu, syncs it to WordPress and sends the
 * feedback e-mails (allow list only). No WhatsApp, no reminders or recaps, no writes to tmclub.eu, so
 * nobody else can notice it is running. Anything else = everything on.
 */
const WORDPRESS_ONLY = process.env.WORKER_MODE === 'wordpress-only';

const TICK = 20_000;
const SYNC_EVERY = 15 * 60_000;
/** Pause between WhatsApp sends: bursts from a fresh number are what gets numbers banned. */
const SEND_GAP = 2_000;
const MAX_ATTEMPTS = 5;

let lastSync = 0;
/** Next WordPress sync; 0 = right after start. The interval depends on how close a meeting is (wpSchedule.ts). */
let nextWpSync = 0;
let ticking = false;
let tmBusy = false;

async function step(name: string, fn: () => unknown) {
  try {
    await fn();
  } catch (e) {
    console.error(`[worker] ${name} failed:`, e instanceof Error ? e.message : e);
  }
}

async function flushOutbox() {
  if (!isWhatsAppReady()) return;
  const due = db
    .select()
    .from(schema.outbox)
    .where(and(isNull(schema.outbox.sentAt), lte(schema.outbox.sendAfter, new Date()), lt(schema.outbox.attempts, MAX_ATTEMPTS)))
    .orderBy(asc(schema.outbox.id))
    .limit(20)
    .all();
  for (const msg of due) {
    try {
      await sendWhatsApp(msg);
      db.update(schema.outbox).set({ sentAt: new Date(), error: null }).where(eq(schema.outbox.id, msg.id)).run();
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      db.update(schema.outbox).set({ attempts: msg.attempts + 1, error }).where(eq(schema.outbox.id, msg.id)).run();
    }
    await new Promise((r) => setTimeout(r, SEND_GAP));
  }
}

/** Everything that only needs our own database: never waits on tmclub.eu. */
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    await step('auto-finish', () => autoFinishMeetings());
    await step('schedule', () => queueDueMessages());
    await step('summaries', () => queueSummaries());
    await step('outbox', flushOutbox);
  } finally {
    ticking = false;
  }
}

/**
 * tmclub.eu runs in its own loop: a pending human check can make a call wait up to 15 minutes,
 * and reminders, recaps and polls must keep going meanwhile.
 */
async function tmTick() {
  if (tmBusy || !tmConfigured()) return;
  tmBusy = true;
  try {
    if (!(await tmReady())) return;
    const requested = getSetting('tm_sync_requested') === '1';
    if (!WORDPRESS_ONLY && (requested || Date.now() - lastSync > SYNC_EVERY)) {
      lastSync = Date.now();
      setSetting('tm_sync_requested', null);
      if ((await guarded('sync', () => syncFromTmClub())) === 'blocked') return;
    }
    if (!WORDPRESS_ONLY) await guarded('role queue', () => processTmJobs());
    if (wpConfigured()) {
      if (requested || Date.now() >= nextWpSync) {
        const started = Date.now();
        // Plan the next one even when this one fails, so a broken WordPress isn't hammered every 20 s.
        const failure = await guarded('wordpress sync', async () => syncToWordPress(await tmApi()), 'wp_sync_error');
        nextWpSync = failure ? Math.min(nextSyncAfter(started), started + 15 * 60_000) : nextSyncAfter(started);
        if (failure === 'blocked') return;
      }
      await guarded('feedback e-mails', async () => sendFeedbackEmails(await tmApi()), 'wp_feedback_error');
    }
  } finally {
    tmBusy = false;
  }
}

if (process.env.VERIFY_GATEWAY_PORT) {
  startVerifyGateway(Number(process.env.VERIFY_GATEWAY_PORT), Number(process.env.TMCLUB_VERIFY_PORT) || 8732);
}

// A start is worth knowing about (deploy, crash, node restart); at most one message per 30 min while crash-looping.
const lastStart = getSetting('tg_last_start');
if (!lastStart || Date.now() - Date.parse(lastStart) > 30 * 60_000) {
  setSetting('tg_last_start', new Date().toISOString());
  void alert('start', `worker started (${WORDPRESS_ONLY ? 'wordpress-only' : 'full'} mode). If you didn't deploy, it restarted after a crash.`, 0);
}

if (WORDPRESS_ONLY) {
  if (!wpConfigured()) throw new Error('WORKER_MODE=wordpress-only needs WP_URL, WP_USER and WP_APP_PASSWORD');
  console.log('[worker] started in wordpress-only mode: WordPress sync and feedback e-mails only');
  void tmTick();
  setInterval(tmTick, TICK);
} else {
  if (process.env.WHATSAPP_ENABLED !== 'false') {
    await startWhatsApp(handleCommand, handlePollVote);
  } else {
    console.log('[worker] WhatsApp disabled — messages stay in the outbox');
  }
  console.log('[worker] started');
  await tick();
  setInterval(tick, TICK);
  void tmTick();
  setInterval(tmTick, TICK);
  // Group list only changes when the bot is added somewhere; refresh it with the sync cadence.
  setInterval(() => step('groups', refreshGroups), SYNC_EVERY);
}
