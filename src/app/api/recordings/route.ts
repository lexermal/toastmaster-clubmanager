import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { currentAccess } from '@/lib/auth';
import { DATA_DIR, db, schema } from '@/lib/db';
import { getMeeting } from '@/lib/meetings';

/** OpenAI's transcription endpoint rejects files above 25 MB. */
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  if (!(await currentAccess())) return Response.json({ error: 'Not logged in' }, { status: 401 });
  const form = await req.formData();
  const audio = form.get('audio');
  const meetingId = Number(form.get('meetingId'));
  const memberId = Number(form.get('memberId'));
  const about = String(form.get('about') ?? '').trim();
  const evaluatorName = String(form.get('evaluatorName') ?? '').trim() || null;

  if (!(audio instanceof File) || audio.size === 0) return Response.json({ error: 'No audio' }, { status: 400 });
  if (audio.size > MAX_BYTES) return Response.json({ error: 'Recording too long (max 25 MB)' }, { status: 400 });
  if (!getMeeting(meetingId) || !memberId || !about) return Response.json({ error: 'Missing meeting, person or topic' }, { status: 400 });

  // Keep the browser's container format in the extension; the transcription API detects by it.
  const ext = audio.type.includes('mp4') ? 'mp4' : audio.type.includes('ogg') ? 'ogg' : 'webm';
  const dir = path.join(DATA_DIR, 'recordings');
  await mkdir(dir, { recursive: true });
  const audioPath = path.join(dir, `${randomUUID()}.${ext}`);
  await writeFile(audioPath, Buffer.from(await audio.arrayBuffer()));

  const row = db.insert(schema.evaluations).values({ meetingId, memberId, about, evaluatorName, audioPath }).returning().get();
  return Response.json({ id: row.id });
}
