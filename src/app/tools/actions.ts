'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireAccess } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { getMeeting } from '@/lib/meetings';
import { normalizePhone } from '@/lib/phone';

export async function saveTiming(input: {
  meetingId: number;
  memberId: number | null;
  speakerName: string;
  kind: string;
  label: string;
  greenSec: number;
  amberSec: number;
  redSec: number;
  durationSec: number;
}) {
  await requireAccess('tools');
  if (!getMeeting(input.meetingId)) return { error: 'Meeting not found' };
  const row = db.insert(schema.timings).values({ ...input, durationSec: Math.round(input.durationSec) }).returning().get();
  revalidatePath('/tools/timer');
  return { data: row };
}

export async function deleteTiming(id: number) {
  await requireAccess('tools');
  db.delete(schema.timings).where(eq(schema.timings.id, id)).run();
  revalidatePath('/tools/timer');
}

export async function saveFillerCounts(input: { meetingId: number; memberId: number | null; speakerName: string; counts: Record<string, number> }) {
  await requireAccess('tools');
  if (!getMeeting(input.meetingId)) return { error: 'Meeting not found' };
  const row = db.insert(schema.fillerCounts).values(input).returning().get();
  revalidatePath('/tools/ah-counter');
  return { data: row };
}

export async function deleteFillerCount(id: number) {
  await requireAccess('tools');
  db.delete(schema.fillerCounts).where(eq(schema.fillerCounts.id, id)).run();
  revalidatePath('/tools/ah-counter');
}

/** Quick-add a guest from a tool (e.g. a guest doing a Table Topic). */
export async function addGuest(input: { meetingId: number; name: string; phone?: string }) {
  await requireAccess('tools');
  const name = input.name.trim();
  if (name.length < 2) return { error: 'Name is too short' };
  const phone = normalizePhone(input.phone);
  if (input.phone?.trim() && !phone) return { error: 'Phone number needs a country code, e.g. +46…' };
  const existing = phone ? db.select().from(schema.members).where(eq(schema.members.phone, phone)).get() : undefined;
  const member = existing ?? db.insert(schema.members).values({ name, phone, isGuest: true }).returning().get();
  const linked = db.select().from(schema.meetingGuests).where(and(eq(schema.meetingGuests.meetingId, input.meetingId), eq(schema.meetingGuests.memberId, member.id))).get();
  if (!linked && member.isGuest) db.insert(schema.meetingGuests).values({ meetingId: input.meetingId, memberId: member.id }).run();
  return { data: { id: member.id, name: member.name } };
}

export async function retryEvaluation(id: number) {
  await requireAccess('tools');
  db.update(schema.evaluations).set({ status: 'processing', error: null }).where(eq(schema.evaluations.id, id)).run();
  revalidatePath('/tools/record');
}

export async function deleteEvaluation(id: number) {
  await requireAccess('tools');
  db.delete(schema.evaluations).where(eq(schema.evaluations.id, id)).run();
  revalidatePath('/tools/record');
}
