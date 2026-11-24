import { existsSync } from 'node:fs';

// Same .env as the web app; in Docker the variables come from the environment instead.
if (existsSync('.env')) process.loadEnvFile('.env');

const { and, asc, eq, lte, lt, isNull } = await import('drizzle-orm');
const { db, schema } = await import('../lib/db');
const { getSetting, setSetting } = await import('../lib/settings');
const { handleCommand, handlePollVote } = await import('./commands');
const { autoFinishMeetings, queueDueMessages } = await import('./scheduler');
const { processEvaluations, queueSummaries } = await import('./summaries');
const { processTmJobs, syncFromTmClub, tmConfigured } = await import('./tmclub');
const { isWhatsAppReady, refreshGroups, sendWhatsApp, startWhatsApp } = await import('./whatsapp');

const TICK = 20_000;
const SYNC_EVERY = 15 * 60_000;
/** Pause between WhatsApp sends: bursts from a fresh number are what gets numbers banned. */
const SEND_GAP = 2_000;
const MAX_ATTEMPTS = 5;

let lastSync = 0;
let ticking = false;

async function step(name: string, fn: () => unknown) {
  try {
    await fn();
  } catch (e) {
    console.error(`[worker] ${name} failed:`, e instanceof Error ? e.message : e);
    if (name === 'sync') setSetting('tm_sync_error', e instanceof Error ? e.message : String(e));
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

async function tick() {
  if (ticking) return; // a slow sync must not overlap with the next tick
  ticking = true;
  try {
    if (tmConfigured()) {
      const requested = getSetting('tm_sync_requested') === '1';
      if (requested || Date.now() - lastSync > SYNC_EVERY) {
        lastSync = Date.now();
        setSetting('tm_sync_requested', null);
        await step('sync', () => syncFromTmClub());
        await step('groups', refreshGroups);
      }
      await step('tm-jobs', processTmJobs);
    }
    await step('auto-finish', () => autoFinishMeetings());
    await step('schedule', () => queueDueMessages());
    await step('evaluations', processEvaluations);
    await step('summaries', () => queueSummaries());
    await step('outbox', flushOutbox);
  } finally {
    ticking = false;
  }
}

if (process.env.WHATSAPP_ENABLED !== 'false') {
  await startWhatsApp(handleCommand, handlePollVote);
} else {
  console.log('[worker] WhatsApp disabled — messages stay in the outbox');
}
console.log('[worker] started');
await tick();
setInterval(tick, TICK);
