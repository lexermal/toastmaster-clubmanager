'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Re-render the server page every few seconds (e.g. while waiting for a WhatsApp QR scan). */
export function AutoRefresh({ every = 5000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [every, router]);
  return null;
}
