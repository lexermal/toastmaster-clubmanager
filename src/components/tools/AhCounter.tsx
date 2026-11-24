'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { deleteFillerCount, saveFillerCounts } from '@/app/tools/actions';
import type { Person } from '@/app/tools/data';
import { FILLER_WORDS } from '@/lib/roles';
import { PersonPicker, type Picked } from './PersonPicker';

interface Saved {
  id: number;
  speakerName: string;
  counts: Record<string, number>;
}

const empty = () => Object.fromEntries(FILLER_WORDS.map((w) => [w, 0]));

export function AhCounter({ meetingId, people, history: initial }: { meetingId: number; people: Person[]; history: Saved[] }) {
  const [speaker, setSpeaker] = useState<Picked | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>(empty);
  const [history, setHistory] = useState(initial);
  const [pending, start] = useTransition();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  function bump(word: string, by: number) {
    navigator.vibrate?.(15);
    setCounts((c) => ({ ...c, [word]: Math.max(0, c[word] + by) }));
  }

  function save() {
    if (!speaker) return;
    start(async () => {
      const res = await saveFillerCounts({ meetingId, memberId: speaker.memberId, speakerName: speaker.name, counts });
      if (res.data) setHistory((h) => [res.data, ...h]);
      setCounts(empty());
      setSpeaker(null);
    });
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-5">
      <Link href={`/tools?meeting=${meetingId}`} className="text-sm text-ink-soft">← Tools</Link>
      <div className="mt-3 flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-semibold">Ah-Counter</h1>
        <span className="font-mono text-2xl text-maroon">{total}</span>
      </div>
      <div className="mt-4">
        <PersonPicker meetingId={meetingId} people={people} value={speaker} onChange={setSpeaker} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {FILLER_WORDS.map((w) => (
          <div key={w} className="relative">
            <button
              onClick={() => bump(w, 1)}
              className="flex aspect-square w-full flex-col items-center justify-center rounded-2xl border border-line bg-card active:scale-95 active:bg-yellow/40"
            >
              <span className="font-mono text-4xl font-semibold tabular-nums">{counts[w]}</span>
              <span className="mt-1 text-sm text-ink-soft">{w}</span>
            </button>
            {counts[w] > 0 && (
              <button onClick={() => bump(w, -1)} className="absolute right-1.5 top-1.5 size-7 rounded-full bg-paper-2 text-sm" aria-label={`Undo ${w}`}>
                −
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <button className="btn btn-primary" disabled={!speaker || pending} onClick={save}>
          {speaker ? `Save for ${speaker.name.split(' ')[0]}` : 'Pick a speaker to save'}
        </button>
        <button className="btn btn-ghost" onClick={() => setCounts(empty())}>Reset</button>
      </div>
      {history.length > 0 && (
        <ul className="mt-8 divide-y divide-line border-y border-line text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex items-start gap-3 py-3">
              <span className="w-32 shrink-0 font-semibold">{h.speakerName}</span>
              <span className="flex-1 text-ink-soft">
                {Object.entries(h.counts).filter(([, c]) => c > 0).map(([w, c]) => `${w} ×${c}`).join(', ') || 'none'}
              </span>
              <button className="text-ink-soft" aria-label="Delete" onClick={() => start(async () => {
                await deleteFillerCount(h.id);
                setHistory((x) => x.filter((y) => y.id !== h.id));
              })}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
