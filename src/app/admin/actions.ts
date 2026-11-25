'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAccess, revokeAccess } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { queueRolesPoll, queueSpeechPing } from '@/lib/engagement';
import { getMeeting } from '@/lib/meetings';
import { enqueue } from '@/lib/outbox';
import { normalizePhone } from '@/lib/phone';
import { setSetting } from '@/lib/settings';

export async function logout() {
  await revokeAccess();
  redirect('/');
}

export async function requestSync() {
  await requireAccess('admin');
  setSetting('tm_sync_requested', '1');
  revalidatePath('/admin');
}

export async function chooseGroup(form: FormData) {
  await requireAccess('admin');
  setSetting('wa_group_jid', String(form.get('jid') || '') || null);
  revalidatePath('/admin');
}

export async function savePhone(form: FormData): Promise<void> {
  await requireAccess('admin');
  const id = Number(form.get('id'));
  const raw = String(form.get('phone') ?? '');
  const phone = normalizePhone(raw);
  if (raw.trim() && !phone) return;
  const clash = phone && db.select().from(schema.members).where(eq(schema.members.phone, phone)).get();
  if (clash && clash.id !== id) return;
  db.update(schema.members).set({ phone }).where(eq(schema.members.id, id)).run();
  revalidatePath('/admin/members');
}

export async function toggleMuted(id: number, muted: boolean) {
  await requireAccess('admin');
  db.update(schema.members).set({ muted }).where(eq(schema.members.id, id)).run();
  revalidatePath('/admin/members');
}

export async function setMeetingStatus(id: number, status: 'scheduled' | 'live' | 'finished') {
  await requireAccess('admin');
  const now = new Date();
  db.update(schema.meetings)
    .set({
      status,
      ...(status === 'live' ? { startedAt: now, finishedAt: null } : {}),
      ...(status === 'finished' ? { finishedAt: now } : {}),
      ...(status === 'scheduled' ? { startedAt: null, finishedAt: null } : {}),
    })
    .where(eq(schema.meetings.id, id))
    .run();
  revalidatePath(`/admin/meetings/${id}`);
}

/** Lets summaries go out again, e.g. after fixing a phone number. Already-sent ones are deduped. */
export async function requeueSummaries(id: number) {
  await requireAccess('admin');
  db.update(schema.meetings).set({ summariesQueuedAt: null }).where(eq(schema.meetings.id, id)).run();
  revalidatePath(`/admin/meetings/${id}`);
}

export async function sendTestMessage(form: FormData) {
  await requireAccess('admin');
  const to = normalizePhone(String(form.get('phone')));
  if (!to) return;
  enqueue({ to, kind: 'test', body: String(form.get('text') || 'Hello from the club bot 👋') });
  revalidatePath('/admin');
}

export async function retryOutbox(id: number) {
  await requireAccess('admin');
  db.update(schema.outbox).set({ attempts: 0, error: null }).where(eq(schema.outbox.id, id)).run();
  revalidatePath('/admin');
}

export async function cancelOutbox(id: number) {
  await requireAccess('admin');
  db.delete(schema.outbox).where(eq(schema.outbox.id, id)).run();
  revalidatePath('/admin');
}

/** Manual triggers return a short status shown next to the button. */
export async function sendRolesPoll(id: number): Promise<string> {
  await requireAccess('admin');
  const meeting = getMeeting(id);
  if (!meeting) return 'Meeting not found.';
  return queueRolesPoll(meeting) ? 'Poll queued for the group chat.' : 'No open roles to poll.';
}

export async function pingRandomSpeaker(id: number): Promise<string> {
  await requireAccess('admin');
  const meeting = getMeeting(id);
  if (!meeting) return 'Meeting not found.';
  const res = queueSpeechPing(meeting, `:manual-${Date.now()}`);
  return res.error ?? `Pinging ${res.member!.name} in the group.`;
}

/** Re-arms tmclub.eu after a failed human check / rejected login; the worker picks it up within 20 s. */
export async function retryTmClub() {
  await requireAccess('admin');
  setSetting('tm_reset_requested', '1');
  setSetting('tm_sync_requested', '1');
  revalidatePath('/admin', 'layout');
}

/** Put a failed role write back in the queue. */
export async function retryTmJob(id: number) {
  await requireAccess('admin');
  db.update(schema.tmJobs).set({ status: 'pending', attempts: 0, nextAttemptAt: null, error: null }).where(eq(schema.tmJobs.id, id)).run();
  revalidatePath('/admin');
}
