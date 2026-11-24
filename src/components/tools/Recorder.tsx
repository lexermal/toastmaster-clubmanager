'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { deleteEvaluation, retryEvaluation } from '@/app/tools/actions';
import { formatDuration } from '@/lib/roles';
import type { Target } from '@/lib/targets';

interface Row {
  id: number;
  name: string;
  about: string;
  evaluatorName: string | null;
  status: 'processing' | 'done' | 'error';
  summary: string | null;
  error: string | null;
}

export function Recorder({ meetingId, targets, rows }: { meetingId: number; targets: Target[]; rows: Row[] }) {
  const router = useRouter();
  const [target, setTarget] = useState('');
  const [about, setAbout] = useState('');
  const [evaluator, setEvaluator] = useState('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [, start] = useTransition();
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  // Poll while the worker is transcribing so statuses update by themselves.
  const processing = rows.some((r) => r.status === 'processing');
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [processing, router]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  async function begin() {
    setError(undefined);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      // Low bitrate is plenty for speech and keeps 10 minutes far below the 25 MB upload limit.
      const rec = new MediaRecorder(stream, { audioBitsPerSecond: 32_000 });
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        upload(new Blob(chunks.current, { type: rec.mimeType }));
      };
      rec.start(1000);
      recorder.current = rec;
      setSeconds(0);
      setRecording(true);
    } catch {
      setError('Microphone not available. Allow microphone access and try again.');
    }
  }

  async function upload(blob: Blob) {
    setUploading(true);
    const form = new FormData();
    form.set('audio', blob, 'evaluation');
    form.set('meetingId', String(meetingId));
    form.set('memberId', target.split('|')[0]);
    form.set('about', about);
    form.set('evaluatorName', evaluator);
    const res = await fetch('/api/recordings', { method: 'POST', body: form });
    setUploading(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? 'Upload failed');
    setTarget('');
    setAbout('');
    router.refresh();
  }

  const ready = target && about.trim();
  return (
    <div className="mx-auto max-w-xl px-4 py-5">
      <Link href={`/tools?meeting=${meetingId}`} className="text-sm text-ink-soft">← Tools</Link>
      <h1 className="mt-3 font-display text-3xl font-semibold">Record evaluation</h1>
      <p className="mt-1 text-sm text-ink-soft">For speech evaluations and the General Evaluator’s feedback on roles. Hold the phone near the evaluator.</p>

      <div className="mt-5 flex flex-col gap-3">
        <select
          className="field"
          value={target}
          disabled={recording}
          onChange={(e) => {
            setTarget(e.target.value);
            setAbout(e.target.value.split('|').slice(1).join('|'));
          }}
        >
          <option value="">Feedback for…</option>
          {targets.map((t) => (
            <option key={`${t.memberId}|${t.about}`} value={`${t.memberId}|${t.about}`}>{t.name} — {t.about}</option>
          ))}
        </select>
        <input className="field" value={about} disabled={recording} onChange={(e) => setAbout(e.target.value)} placeholder="About (e.g. Speech, Timekeeper)" />
        <input className="field" value={evaluator} disabled={recording} onChange={(e) => setEvaluator(e.target.value)} placeholder="Evaluator’s name (optional)" />
      </div>

      <button
        onClick={() => {
          if (!recording) return begin();
          setRecording(false);
          recorder.current?.stop();
        }}
        disabled={(!ready && !recording) || uploading}
        className={`mt-6 flex w-full flex-col items-center justify-center rounded-[2rem] py-10 text-white transition disabled:opacity-40 ${recording ? 'bg-stop' : 'bg-ink'}`}
      >
        <span className={`size-6 ${recording ? 'rounded-md bg-white' : 'rounded-full bg-stop'}`} />
        <span className="mt-4 font-mono text-4xl">{formatDuration(seconds)}</span>
        <span className="mt-2 text-sm opacity-80">{uploading ? 'Uploading…' : recording ? 'Tap to stop & send' : 'Tap to record'}</span>
      </button>
      {error && <p className="mt-3 text-sm text-stop">{error}</p>}

      {rows.length > 0 && (
        <ul className="mt-8 flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-card p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{r.name} — {r.about}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === 'done' ? 'bg-go/15 text-go' : r.status === 'error' ? 'bg-stop/15 text-stop' : 'bg-wait/20'}`}>
                  {r.status === 'processing' ? 'transcribing…' : r.status}
                </span>
              </div>
              {r.summary && <p className="mt-2 whitespace-pre-line text-ink-soft">{r.summary}</p>}
              {r.error && <p className="mt-2 text-stop">{r.error}</p>}
              <div className="mt-2 flex gap-4 text-xs text-ink-soft">
                {r.status === 'error' && <button onClick={() => start(() => retryEvaluation(r.id))}>Retry</button>}
                <button onClick={() => confirm('Delete this recording?') && start(() => deleteEvaluation(r.id))}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
