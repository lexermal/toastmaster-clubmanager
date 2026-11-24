import Link from 'next/link';
import { CLUB } from '@/lib/club';
import { TimingLights } from './TimingLights';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-paper-2">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="font-display text-2xl font-semibold">{CLUB.name}</p>
          <p className="mt-2 max-w-sm text-ink-soft">{CLUB.tagline}</p>
          <TimingLights className="mt-5" size={8} />
        </div>
        <div className="text-sm">
          <p className="mb-3 font-semibold uppercase tracking-[0.15em] text-ink-soft">Meet us</p>
          <p>{CLUB.schedule}</p>
          <a href={CLUB.venue.mapsUrl} className="mt-1 block underline decoration-line underline-offset-4 hover:decoration-ink">
            {CLUB.venue.name}
          </a>
          <p className="mt-1 text-ink-soft">Meetings in {CLUB.language}</p>
        </div>
        <div className="text-sm">
          <p className="mb-3 font-semibold uppercase tracking-[0.15em] text-ink-soft">Contact</p>
          <a href={`mailto:${CLUB.email}`} className="block break-all hover:underline">
            {CLUB.email}
          </a>
          <div className="mt-3 flex flex-col gap-1 text-ink-soft">
            {CLUB.links.meetup && <a href={CLUB.links.meetup} className="hover:text-ink">Meetup</a>}
            {CLUB.links.instagram && <a href={CLUB.links.instagram} className="hover:text-ink">Instagram</a>}
            {CLUB.links.linkedin && <a href={CLUB.links.linkedin} className="hover:text-ink">LinkedIn</a>}
            <a href={CLUB.links.toastmastersOrg} className="hover:text-ink">Toastmasters International</a>
          </div>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-4 text-xs text-ink-soft sm:px-6">
          <span>
            Club {CLUB.clubNumber} · {CLUB.district} · Toastmasters International
          </span>
          <Link href="/tools" className="hover:text-ink">Member tools</Link>
        </div>
      </div>
    </footer>
  );
}
