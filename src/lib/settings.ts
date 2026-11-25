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
  | 'tm_reset_requested';

export function getSetting(key: SettingKey): string | null {
  return db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()?.value ?? null;
}

export function setSetting(key: SettingKey, value: string | null) {
  db.insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}
