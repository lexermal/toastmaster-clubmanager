import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { CLUB } from '@/lib/club';
import { formatMeetingDate, formatTime } from '@/lib/format';
import { meetingRoles, roleLabel, upcomingMeetings } from '@/lib/meetings';
import { guideForRole } from '@/lib/roles';
import { EVENING } from '../content';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Meetings' };

export default function MeetingsPage() {
  const meetings = upcomingMeetings(4).map((m) => ({ meeting: m, roles: meetingRoles(m.id) }));
  return (
    <>
      <PageHeader
        eyebrow="Meetings"
        title={
          <>
            Every second Monday, <span className="italic text-maroon">in English.</span>
          </>
        }
        intro={`${CLUB.schedule} at ${CLUB.venue.name}. Guests are always welcome — no sign-up, no cost.`}
      />

      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        {meetings.length === 0 && <p className="text-ink-soft">The next dates will appear here soon.</p>}
        <div className="grid gap-6 md:grid-cols-2">
          {meetings.map(({ meeting, roles }, i) => (
            <article key={meeting.id} className={`rounded-3xl border border-line bg-card p-6 ${i === 0 ? 'md:col-span-2' : ''}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-2xl font-semibold">{formatMeetingDate(meeting.startsAt)}</h2>
                <span className="font-mono text-maroon">{formatTime(meeting.startsAt)}</span>
              </div>
              {meeting.theme && <p className="mt-1 font-display text-lg italic text-ink-soft">“{meeting.theme}”</p>}
              {roles.length > 0 && (
                <ul className={`mt-5 grid gap-x-8 gap-y-2 text-sm ${i === 0 ? 'sm:grid-cols-2 lg:grid-cols-3' : ''}`}>
                  {roles.map((r) => {
                    const guide = guideForRole(r.role);
                    return (
                      <li key={r.id} className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5">
                        {guide ? (
                          <Link href={`/roles/${guide.slug}`} className="hover:text-maroon">{roleLabel(r)}</Link>
                        ) : (
                          <span>{roleLabel(r)}</span>
                        )}
                        {r.member ? (
                          <span className="truncate text-ink-soft">{r.member.name}</span>
                        ) : (
                          <span className="rounded-full bg-yellow/60 px-2 py-0.5 text-xs font-semibold text-[#3d3200]">open</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>

      <section id="visit" className="mx-auto mt-24 grid max-w-6xl scroll-mt-28 gap-12 px-4 sm:px-6 md:grid-cols-2">
        <div>
          <h2 className="font-display text-4xl font-semibold tracking-tight">Visiting as a guest</h2>
          <ul className="mt-6 space-y-4 text-lg leading-relaxed">
            <li><strong>Where:</strong> {CLUB.venue.name} — <a className="text-maroon underline underline-offset-4" href={CLUB.venue.mapsUrl}>open in Maps</a></li>
            <li><strong>When:</strong> {CLUB.schedule}. Arrive 10 minutes early and say hi at the door.</li>
            <li><strong>What to bring:</strong> nothing. Maybe curiosity.</li>
            <li><strong>At the meeting:</strong> scan the QR code on the table to check in, follow the agenda and leave feedback for the speakers.</li>
          </ul>
          <a href={`mailto:${CLUB.email}?subject=Visiting%20a%20meeting`} className="btn btn-primary mt-8">Let us know you’re coming</a>
        </div>
        <ol className="relative border-l-2 border-line">
          {EVENING.map((e) => (
            <li key={e.title} className="pb-7 pl-7">
              <span className="font-mono text-sm text-ink-soft">{e.time}</span>
              <h3 className="font-display text-lg font-semibold">{e.title}</h3>
              <p className="text-ink-soft">{e.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
