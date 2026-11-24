'use client';

import { useState, useTransition } from 'react';
import { addGuest } from '@/app/tools/actions';
import type { Person } from '@/app/tools/data';

export interface Picked {
  memberId: number | null;
  name: string;
}

/** Choose who is speaking; can quick-add a guest so they also get a WhatsApp recap. */
export function PersonPicker({
  meetingId,
  people: initial,
  value,
  onChange,
  dark = false,
}: {
  meetingId: number;
  people: Person[];
  value: Picked | null;
  onChange: (p: Picked | null) => void;
  dark?: boolean;
}) {
  const [people, setPeople] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const cls = dark ? 'w-full rounded-xl border border-white/25 bg-black/25 px-3 py-2.5 text-white' : 'field';

  if (adding) {
    return (
      <form
        className="flex flex-col gap-2"
        action={(form) =>
          start(async () => {
            const name = String(form.get('name'));
            const res = await addGuest({ meetingId, name, phone: String(form.get('phone') ?? '') });
            if (res.error || !res.data) return setError(res.error);
            setPeople((p) => [...p, { id: res.data.id, name: res.data.name, hint: 'Guest', group: 'Guests' }]);
            onChange({ memberId: res.data.id, name: res.data.name });
            setAdding(false);
          })
        }
      >
        <input name="name" required placeholder="Guest name" className={cls} autoFocus />
        <input name="phone" type="tel" placeholder="WhatsApp +46… (optional, for their recap)" className={cls} />
        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1" disabled={pending}>Add guest</button>
          <button type="button" className="btn btn-ghost !text-ink" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      </form>
    );
  }

  const groups = (['Roles', 'Guests', 'Members'] as const).map((g) => ({ g, items: people.filter((p) => p.group === g) }));
  return (
    <select
      className={cls}
      value={value?.memberId ?? ''}
      onChange={(e) => {
        if (e.target.value === '__guest') return setAdding(true);
        const p = people.find((x) => x.id === Number(e.target.value));
        onChange(p ? { memberId: p.id, name: p.name } : null);
      }}
      aria-label="Speaker"
    >
      <option value="">Who is speaking?</option>
      {groups.map(({ g, items }) =>
        items.length ? (
          <optgroup key={g} label={g}>
            {items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.hint && g === 'Roles' ? ` — ${p.hint}` : ''}
              </option>
            ))}
          </optgroup>
        ) : null,
      )}
      <option value="__guest">+ Add a guest…</option>
    </select>
  );
}
