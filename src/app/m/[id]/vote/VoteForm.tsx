'use client';

import { useActionState } from 'react';
import { castVote, type FormState } from '../actions';

interface Category {
  key: string;
  label: string;
  people: { id: number; name: string; about: string }[];
}

export function VoteForm({ meetingId, categories, disabled }: { meetingId: number; categories: Category[]; disabled: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(castVote, {});
  if (disabled) return <p className="mt-8 rounded-2xl border border-line bg-card p-5">Voting is closed for this meeting.</p>;
  return (
    <form action={action} className="mt-6 flex flex-col gap-6">
      <input type="hidden" name="meetingId" value={meetingId} />
      {categories.filter((c) => c.people.length).map((c) => (
        <fieldset key={c.key} className="rounded-2xl border border-line bg-card p-4">
          <legend className="px-1 font-display text-xl font-semibold">{c.label}</legend>
          <div className="mt-2 flex flex-col gap-2">
            {c.people.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent p-3 has-checked:border-maroon has-checked:bg-maroon/10">
                <input type="radio" name={c.key} value={p.id} className="size-5 accent-[var(--maroon)]" />
                <span className="flex-1 font-medium">{p.name}</span>
                {c.key === 'role' && <span className="text-xs text-ink-soft">{p.about}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {categories.every((c) => !c.people.length) && <p className="text-ink-soft">Nobody to vote for yet.</p>}
      {state.error && <p className="text-sm text-stop">{state.error}</p>}
      {state.ok && <p className="rounded-xl bg-go/10 p-3 text-sm">Vote saved. Thank you! 🗳️</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Submit vote'}</button>
    </form>
  );
}
