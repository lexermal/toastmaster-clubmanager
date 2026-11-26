/**
 * Alerts to the operator on Telegram (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID). Without them this is a
 * no-op, so local runs stay quiet. Failures to send are only logged: alerting must never break the worker.
 */

const lastSent = new Map<string, number>();

export const telegramConfigured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

/**
 * Sends `text` unless the same `key` was sent less than `everyMs` ago (default 1 hour), so a problem
 * that persists for hours doesn't send a message every 20 s tick.
 */
export async function alert(key: string, text: string, everyMs = 60 * 60_000) {
  if (!telegramConfigured()) return;
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < everyMs) return;
  lastSent.set(key, now);
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: `🤖 Club manager: ${text}`, disable_web_page_preview: true }),
    });
    if (!res.ok) console.error('[telegram] send failed:', res.status, (await res.text()).slice(0, 200));
  } catch (e) {
    console.error('[telegram] send failed:', e instanceof Error ? e.message : e);
  }
}

/** Lets a later alert with this key go out right away (e.g. after the problem was fixed). */
export const resetAlert = (key: string) => lastSent.delete(key);
