'use client';

import { useActionState, useEffect, useRef } from 'react';
import type { Target } from '@/lib/targets';
import { submitFeedback, type FormState } from '../actions';

export function FeedbackForm({ meetingId, targets, preselect }: { meetingId: number; targets: Target[]; preselect?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitFeedback, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  if (!targets.length) {
    return <p className="mt-8 rounded-2xl border border-line bg-card p-5 text-ink-soft">No speakers yet — roles appear here once they are assigned.</p>;
  }

  return (
    <form ref={form} action={action} className="mt-6 flex flex-col gap-5">
      <input type="hidden" name="meetingId" value={meetingId} />
      <label className="flex flex-col gap-2">
        <span className="font-semibold">Who is it for?</span>
        <select name="target" className="field" required defaultValue={preselect ?? ''}>
          <option value="" disabled>Choose…</option>
          {targets.map((t) => (
            <option key={`${t.memberId}|${t.about}`} value={`${t.memberId}|${t.about}`}>
              {t.name} — {t.about}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2">
        <span className="flex items-center gap-2 font-semibold"><span className="size-2.5 rounded-full bg-go" /> What worked well?</span>
        <textarea name="positive" rows={3} maxLength={1000} className="field" placeholder="The story about your grandmother pulled me in…" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="flex items-center gap-2 font-semibold"><span className="size-2.5 rounded-full bg-wait" /> One thing to try next time</span>
        <textarea name="improvement" rows={3} maxLength={1000} className="field" placeholder="A pause before the punchline would make it land even harder." />
      </label>
      {state.error && <p className="text-sm text-stop">{state.error}</p>}
      {state.ok && <p className="rounded-xl bg-go/10 p-3 text-sm">Thanks — sent anonymously. Want to give feedback to someone else?</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Sending…' : 'Send feedback'}</button>
    </form>
  );
}
