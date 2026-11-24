'use client';

import { useActionState } from 'react';
import { checkInGuest, type FormState } from '../actions';

export function GuestForm({ meetingId }: { meetingId: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(checkInGuest, {});
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="meetingId" value={meetingId} />
      <label className="flex flex-col gap-2">
        <span className="font-semibold">Your name</span>
        <input name="name" required minLength={2} maxLength={80} autoComplete="name" className="field" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="font-semibold">WhatsApp number <span className="font-normal text-ink-soft">(optional)</span></span>
        <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+46 70 123 45 67" className="field" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="font-semibold">Email <span className="font-normal text-ink-soft">(optional)</span></span>
        <input name="email" type="email" autoComplete="email" className="field" />
      </label>
      <label className="flex items-start gap-3 rounded-xl bg-card p-3 text-sm">
        <input type="checkbox" name="whatsapp" defaultChecked className="mt-0.5 size-5 accent-[var(--maroon)]" />
        Send me my recap on WhatsApp after the meeting. Reply “stop” any time to opt out.
      </label>
      {state.error && <p className="text-sm text-stop">{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Checking in…' : 'Check in'}</button>
    </form>
  );
}
