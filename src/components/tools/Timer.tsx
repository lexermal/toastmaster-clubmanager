'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { deleteTiming, saveTiming } from '@/app/tools/actions';
import type { Person } from '@/app/tools/data';
import { formatDuration, TIMING_PRESETS, timingVerdict, type TimingPreset } from '@/lib/roles';
import { PersonPicker, type Picked } from './PersonPicker';

interface Saved {
  id: number;
  speakerName: string;
  label: string;
  durationSec: number;
  greenSec: number;
  redSec: number;
}

type Phase = 'idle' | 'green' | 'amber' | 'red';
const PHASE_BG: Record<Phase, string> = { idle: '#17130f', green: '#1f8a49', amber: '#e3a51c', red: '#c42b23' };

function phaseAt(sec: number, p: TimingPreset): Phase {
  if (sec >= p.red) return 'red';
  if (sec >= p.amber) return 'amber';
  if (sec >= p.green) return 'green';
  return 'idle';
}

export function Timer({ meetingId, people, history: initialHistory }: { meetingId: number; people: Person[]; history: Saved[] }) {
  const [preset, setPreset] = useState<TimingPreset>(TIMING_PRESETS[0]);
  const [speaker, setSpeaker] = useState<Picked | null>(null);
  // Elapsed = (now - startedAt) + carried; computed from wall-clock so a locked phone doesn't drift.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [carried, setCarried] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [stopped, setStopped] = useState<number | null>(null);
  const [hideDigits, setHideDigits] = useState(false);
  const [history, setHistory] = useState(initialHistory);
  const [pending, start] = useTransition();
  const lastPhase = useRef<Phase>('idle');
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  const running = startedAt !== null;
  const elapsed = (running ? (now - startedAt) / 1000 : 0) + carried;
  const shown = stopped ?? elapsed;
  const phase = phaseAt(shown, preset);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [running]);

  // Buzz on every signal change so the timekeeper can watch the speaker, not the screen.
  useEffect(() => {
    if (running && phase !== lastPhase.current && phase !== 'idle') navigator.vibrate?.(phase === 'red' ? [200, 100, 200] : 200);
    lastPhase.current = phase;
  }, [phase, running]);

  // Keep the screen on while timing.
  useEffect(() => {
    if (running && 'wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then((l) => (wakeLock.current = l)).catch(() => {});
    } else {
      wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
    }
  }, [running]);

  function startTimer() {
    setStopped(null);
    setCarried(0);
    setNow(Date.now());
    setStartedAt(Date.now());
  }

  function stopTimer() {
    setStopped(elapsed);
    setStartedAt(null);
    setCarried(0);
  }

  /** "Time travel": forgot to start on the first word. */
  function addSeconds(s: number) {
    if (running) setCarried((c) => c + s);
    else if (stopped !== null) setStopped(stopped + s);
  }

  function save() {
    if (stopped === null) return;
    const name = speaker?.name ?? 'Unknown speaker';
    start(async () => {
      const res = await saveTiming({
        meetingId,
        memberId: speaker?.memberId ?? null,
        speakerName: name,
        kind: preset.key,
        label: preset.label,
        greenSec: preset.green,
        amberSec: preset.amber,
        redSec: preset.red,
        durationSec: stopped,
      });
      if (res.data) setHistory((h) => [res.data, ...h]);
      setStopped(null);
      setSpeaker(null);
    });
  }

  return (
    <div className="flex min-h-dvh flex-col text-white transition-colors duration-500" style={{ background: PHASE_BG[phase] }}>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-6 pt-4">
        <div className="flex items-center justify-between text-sm">
          <Link href={`/tools?meeting=${meetingId}`} className="opacity-80">← Tools</Link>
          <div className="flex gap-4 opacity-90">
            <button onClick={() => setHideDigits((h) => !h)}>{hideDigits ? 'Show time' : 'Colours only'}</button>
            <button onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>Fullscreen</button>
          </div>
        </div>

        {/* Presets can change mid-speech without losing the running time. */}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {TIMING_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${p.key === preset.key ? 'border-white bg-white text-black' : 'border-white/30'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <PersonPicker meetingId={meetingId} people={people} value={speaker} onChange={setSpeaker} dark />
        </div>

        <button
          onClick={running ? stopTimer : startTimer}
          className="flex flex-1 flex-col items-center justify-center py-10 select-none"
          aria-label={running ? 'Stop' : 'Start'}
        >
          <span className={`font-mono text-[clamp(5rem,26vw,10rem)] font-semibold leading-none tabular-nums ${hideDigits && running ? 'opacity-0' : ''}`}>
            {formatDuration(shown)}
          </span>
          <span className="mt-4 flex gap-3 font-mono text-sm opacity-80">
            <span>G {formatDuration(preset.green)}</span>
            <span>A {formatDuration(preset.amber)}</span>
            <span>R {formatDuration(preset.red)}</span>
          </span>
          <span className="mt-6 text-sm uppercase tracking-[0.3em] opacity-70">{running ? 'Tap to stop' : stopped !== null ? 'Stopped' : 'Tap to start'}</span>
        </button>

        <div className="grid grid-cols-3 gap-2">
          {[10, 30, 60].map((s) => (
            <button key={s} onClick={() => addSeconds(s)} className="rounded-xl border border-white/30 bg-black/15 py-3 font-mono font-semibold" disabled={!running && stopped === null}>
              +{s}s
            </button>
          ))}
        </div>

        {stopped !== null && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={save} disabled={pending} className="rounded-xl bg-white py-3.5 font-semibold text-black">
              {pending ? 'Saving…' : `Save ${speaker ? `for ${speaker.name.split(' ')[0]}` : ''}`}
            </button>
            <button onClick={() => setStopped(null)} className="rounded-xl border border-white/40 py-3.5 font-semibold">
              Discard
            </button>
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="bg-black/30">
          <ul className="mx-auto max-w-xl divide-y divide-white/10 px-4 py-2 text-sm">
            {history.map((h) => {
              const v = timingVerdict(h);
              return (
                <li key={h.id} className="flex items-center gap-3 py-2.5">
                  <span className={`size-2.5 rounded-full ${v === 'ok' ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className="flex-1 truncate">{h.speakerName} <span className="opacity-60">· {h.label}</span></span>
                  <span className="font-mono">{formatDuration(h.durationSec)}</span>
                  <button
                    className="opacity-50 hover:opacity-100"
                    aria-label="Delete"
                    onClick={() => start(async () => {
                      await deleteTiming(h.id);
                      setHistory((x) => x.filter((y) => y.id !== h.id));
                    })}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
