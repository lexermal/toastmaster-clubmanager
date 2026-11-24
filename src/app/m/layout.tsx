import Link from 'next/link';
import { TimingLights } from '@/components/TimingLights';
import { CLUB } from '@/lib/club';

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grain min-h-dvh">
      <div className="mx-auto max-w-md px-4 pb-16 pt-6">
        <Link href="/" className="flex items-center justify-center gap-2 text-sm font-semibold text-ink-soft">
          <TimingLights size={7} /> {CLUB.name}
        </Link>
        {children}
      </div>
    </div>
  );
}
