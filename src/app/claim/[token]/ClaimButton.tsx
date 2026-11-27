'use client';

import { useState, useTransition } from 'react';
import { claimFromLink } from './actions';

export function ClaimButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <>
      <button className="btn btn-primary w-full" disabled={pending} onClick={() => start(async () => setError((await claimFromLink(token)).error))}>
        {pending ? 'Signing you up…' : 'Yes, I’ll take it'}
      </button>
      {error && <p className="mt-3 text-sm text-stop">{error}</p>}
    </>
  );
}
