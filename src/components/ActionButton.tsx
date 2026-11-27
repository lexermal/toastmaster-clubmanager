'use client';

import { useState, useTransition } from 'react';

/** Button for a server action that returns a status line. */
export function ActionButton({ action, children }: { action: () => Promise<string>; children: React.ReactNode }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string>();
  return (
    <span className="inline-flex flex-col">
      <button className="btn btn-ghost" disabled={pending} onClick={() => start(async () => setStatus(await action()))}>
        {children}
      </button>
      {status && <span className="mt-1 max-w-48 text-xs text-ink-soft">{status}</span>}
    </span>
  );
}
