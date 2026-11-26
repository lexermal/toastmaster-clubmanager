import { eq } from 'drizzle-orm';
import { db, schema } from './db';

export type SettingKey =
  | 'wa_status'
  | 'wa_qr'
  | 'wa_groups'
  | 'wa_group_jid'
  | 'wa_me'
  | 'tm_last_sync'
  | 'tm_sync_error'
  | 'tm_sync_requested'
  /** "ok" | "needs-human" (check link sent, waiting) | "blocked" (paused until an admin retries) */
  | 'tm_state'
  | 'tm_state_reason'
  | 'tm_verify_url'
  | 'tm_verify_expires'
  | 'tm_reset_requested'
  | 'wp_last_sync'
  | 'wp_sync_error'
  | 'wp_feedback_error'
  /** When the worker last reported a start on Telegram (limits alerts while crash-looping). */
  | 'tg_last_start'
  /** When tmclub.eu work was paused (state "blocked"); wordpress-only mode retries 6 h later. */
  | 'tm_blocked_at'
  /** JSON list of the path tokens of every check link sent so far: an old link still leads to the current check. */
  | 'tm_verify_tokens'
  /** When an old check link asked for a fresh check (the link page waits for it). */
  | 'tm_retry_started_at';

export function getSetting(key: SettingKey): string | null {
  return db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()?.value ?? null;
}

export function setSetting(key: SettingKey, value: string | null) {
  db.insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}
