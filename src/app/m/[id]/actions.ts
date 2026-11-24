'use server';

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { getMeeting } from '@/lib/meetings';
import { guestWelcome } from '@/lib/messages';
import { enqueue } from '@/lib/outbox';
import { normalizePhone } from '@/lib/phone';
import { VOTE_CATEGORIES } from '@/lib/roles';

export type FormState = { error?: string; ok?: boolean };

const feedbackSchema = z.object({
  meetingId: z.coerce.number().int(),
  target: z.string().regex(/^\d+\|.+$/, 'Choose who the feedback is for'),
  positive: z.string().trim().max(1000),
  improvement: z.string().trim().max(1000),
});

export async function submitFeedback(_: FormState, form: FormData): Promise<FormState> {
  const parsed = feedbackSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { meetingId, target, positive, improvement } = parsed.data;
  if (!positive && !improvement) return { error: 'Write at least one sentence.' };
  if (!getMeeting(meetingId)) return { error: 'Meeting not found.' };
  // Target is "<memberId>|<what it is about>", e.g. "12|Speech" — one person can have several parts.
  const [memberId, about] = [Number(target.split('|')[0]), target.split('|').slice(1).join('|')];
  db.insert(schema.feedback).values({ meetingId, memberId, about, positive: positive || null, improvement: improvement || null }).run();
  return { ok: true };
}

async function voterKey() {
  const jar = await cookies();
  let key = jar.get('voter')?.value;
  if (!key) {
    key = randomUUID();
    jar.set('voter', key, { httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365, path: '/' });
  }
  return key;
}

export async function castVote(_: FormState, form: FormData): Promise<FormState> {
  const meetingId = Number(form.get('meetingId'));
  if (!getMeeting(meetingId)) return { error: 'Meeting not found.' };
  const key = await voterKey();
  let count = 0;
  for (const cat of VOTE_CATEGORIES) {
    const memberId = Number(form.get(cat.key));
    if (!memberId) continue;
    db.insert(schema.votes)
      .values({ meetingId, category: cat.key, memberId, voterKey: key })
      .onConflictDoUpdate({ target: [schema.votes.meetingId, schema.votes.category, schema.votes.voterKey], set: { memberId } })
      .run();
    count++;
  }
  return count ? { ok: true } : { error: 'Pick at least one person.' };
}

const guestSchema = z.object({
  meetingId: z.coerce.number().int(),
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(120).optional(),
  whatsapp: z.literal('on').optional(),
});

export async function checkInGuest(_: FormState, form: FormData): Promise<FormState> {
  const parsed = guestSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { meetingId, name, email } = parsed.data;
  const whatsapp = parsed.data.whatsapp === 'on';
  const meeting = getMeeting(meetingId);
  if (!meeting) return { error: 'Meeting not found.' };
  const phone = normalizePhone(parsed.data.phone);
  if (parsed.data.phone && !phone) return { error: 'That phone number looks wrong — include the country code, e.g. +46…' };

  // Returning guests (same phone) keep one record across visits.
  const existing = phone ? db.select().from(schema.members).where(eq(schema.members.phone, phone)).get() : undefined;
  const member =
    existing ??
    db
      .insert(schema.members)
      .values({ name, phone: whatsapp ? phone : null, email: email || null, isGuest: true })
      .returning()
      .get();
  const already = db
    .select()
    .from(schema.meetingGuests)
    .where(and(eq(schema.meetingGuests.meetingId, meetingId), eq(schema.meetingGuests.memberId, member.id)))
    .get();
  if (!already && member.isGuest) {
    db.insert(schema.meetingGuests).values({ meetingId, memberId: member.id }).run();
    if (whatsapp && member.phone) {
      enqueue({ to: member.phone, kind: 'guest-welcome', meetingId, memberId: member.id, dedupeKey: `guest-welcome:${meetingId}:${member.id}`, body: guestWelcome(member, meeting) });
    }
  }
  redirect(`/m/${meetingId}?welcome=1`);
}
