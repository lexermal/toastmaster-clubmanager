import { createHmac, timingSafeEqual } from 'node:crypto';

// Kept free of Next.js imports: the worker uses it too (claim links in WhatsApp messages).
function secret() {
  const s = process.env.APP_SECRET;
  if (!s) throw new Error('APP_SECRET is not set');
  return s;
}

export function sign(value: string) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

export function verify(value: string, signature: string) {
  const a = Buffer.from(sign(value));
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
