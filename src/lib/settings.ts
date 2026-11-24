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
  | 'tm_sync_requested';

export function getSetting(key: SettingKey): string | null {
  return db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()?.value ?? null;
}

export function setSetting(key: SettingKey, value: string | null) {
  db.insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}
