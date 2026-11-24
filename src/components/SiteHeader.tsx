import Link from 'next/link';
import { CLUB } from '@/lib/club';
import { TimingLights } from './TimingLights';

const NAV = [
  { href: '/meetings', label: 'Meetings' },
  { href: '/roles', label: 'Roles' },
  { href: '/membership', label: 'Membership' },
  { href: '/about', label: 'About' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <TimingLights size={9} />
          <span className="font-display text-lg font-semibold tracking-tight">{CLUB.name}</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-ink-soft md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="transition-colors hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <Link href="/meetings#visit" className="btn btn-primary !px-4 !py-2 text-sm">
          Visit as a guest
        </Link>
      </div>
      {/* Phones: scrollable nav row instead of a hamburger — four links fit fine. */}
      <nav className="flex gap-5 overflow-x-auto px-4 pb-2.5 text-sm font-medium text-ink-soft md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="shrink-0">
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
