import Link from 'next/link';
import { CLUB } from '@/lib/club';
import { formatMeetingDate, formatTime } from '@/lib/format';
import { upcomingMeetings } from '@/lib/meetings';
import { TimingLights } from './TimingLights';

/** Ticket-style card with the next meeting from easy-Speak; falls back to the regular schedule. */
export function NextMeetingCard() {
  const next = upcomingMeetings(1)[0];
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-line bg-card p-6 shadow-[0_30px_60px_-30px_rgba(60,30,20,0.35)] sm:p-7">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">Next meeting</span>
        <TimingLights size={8} animate />
      </div>
      {next ? (
        <>
          <p className="mt-4 font-display text-3xl font-semibold leading-tight">{formatMeetingDate(next.startsAt)}</p>
          <p className="mt-1 font-mono text-lg text-maroon">{formatTime(next.startsAt)}</p>
          {next.theme && (
            <p className="mt-4 text-ink-soft">
              Theme <span className="font-display text-lg italic text-ink">“{next.theme}”</span>
            </p>
          )}
          <p className="mt-1 text-sm text-ink-soft">{next.venue ?? CLUB.venue.name}</p>
        </>
      ) : (
        <>
          <p className="mt-4 font-display text-2xl font-semibold leading-tight">{CLUB.schedule}</p>
          <p className="mt-2 text-sm text-ink-soft">{CLUB.venue.name}</p>
        </>
      )}
      {/* Perforation, like a ticket stub. */}
      <div className="relative my-5 border-t border-dashed border-line">
        <span className="absolute -left-10 -top-3 size-6 rounded-full bg-paper" />
        <span className="absolute -right-10 -top-3 size-6 rounded-full bg-paper" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-ink-soft">Free for guests · No sign-up needed</span>
        <Link href="/meetings#visit" className="text-sm font-semibold text-maroon underline-offset-4 hover:underline">
          Plan your visit →
        </Link>
      </div>
    </div>
  );
}
