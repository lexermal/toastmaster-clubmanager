import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CLUB } from '@/lib/club';
import { formatMeetingDate, formatTime } from '@/lib/format';
import { getMeeting, meetingRoles, roleLabel } from '@/lib/meetings';

export const dynamic = 'force-dynamic';

export default async function MeetingHub({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const meeting = getMeeting(Number((await params).id));
  if (!meeting) notFound();
  const { welcome } = await searchParams;
  const roles = meetingRoles(meeting.id);
  const base = `/m/${meeting.id}`;

  const links = [
    { href: `${base}/feedback`, title: 'Give feedback to a speaker', sub: 'Anonymous · one positive, one tip', accent: 'var(--go)' },
    { href: `${base}/vote`, title: 'Vote for tonight’s best', sub: 'Speaker · Table Topic · Evaluator · Role', accent: 'var(--wait)' },
    { href: `${base}/guest`, title: 'I’m a guest — check in', sub: 'Get your personal recap on WhatsApp', accent: 'var(--stop)' },
    { href: '/membership', title: 'Become a member', sub: 'How joining works and what it costs', accent: 'var(--maroon)' },
  ];

  return (
    <>
      <header className="rise mt-8 text-center">
        {meeting.status === 'live' && (
          <span className="inline-flex items-center gap-2 rounded-full bg-stop px-3 py-1 text-xs font-bold uppercase tracking-widest text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" /> Live now
          </span>
        )}
        <h1 className="mt-4 font-display text-4xl font-semibold leading-tight">{formatMeetingDate(meeting.startsAt)}</h1>
        <p className="mt-1 font-mono text-maroon">
          {formatTime(meeting.startsAt)}
          {meeting.number ? ` · Meeting #${meeting.number}` : ''}
        </p>
        {meeting.theme && <p className="mt-3 font-display text-xl italic">“{meeting.theme}”</p>}
        {meeting.wordOfTheDay && (
          <p className="mt-3 text-sm text-ink-soft">
            Word of the day <span className="ml-1 rounded-md bg-yellow/70 px-2 py-0.5 font-semibold text-[#3d3200]">{meeting.wordOfTheDay}</span>
          </p>
        )}
      </header>

      {welcome && (
        <p className="mt-6 rounded-2xl border border-go/40 bg-go/10 p-4 text-center text-sm">Welcome! You’re checked in. Enjoy the meeting 🎉</p>
      )}

      <nav className="mt-8 flex flex-col gap-3">
        {links.map((l, i) => (
          <Link
            key={l.href}
            href={l.href}
            className="rise group flex items-center gap-4 rounded-2xl border border-line bg-card p-4 transition active:scale-[0.98]"
            style={{ animationDelay: `${120 + i * 60}ms` }}
          >
            <span className="h-10 w-1.5 rounded-full" style={{ background: l.accent }} />
            <span className="flex-1">
              <span className="block font-semibold">{l.title}</span>
              <span className="block text-sm text-ink-soft">{l.sub}</span>
            </span>
            <span className="text-xl text-ink-soft transition-transform group-hover:translate-x-1">→</span>
          </Link>
        ))}
      </nav>

      {roles.length > 0 && (
        <details className="mt-6 rounded-2xl border border-line bg-card p-4" open>
          <summary className="cursor-pointer font-semibold">Tonight’s roles</summary>
          <ul className="mt-3 divide-y divide-line text-sm">
            {roles.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 py-2">
                <span className="text-ink-soft">{roleLabel(r)}</span>
                <span className="text-right">{r.member?.name ?? '—'}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
        {meeting.tmMeetingId && (
          <a className="btn btn-ghost" href={`https://tmclub.eu/viewmeeting_mobile.php?t=${meeting.tmMeetingId}`}>
            Agenda on tmclub
          </a>
        )}
        {CLUB.links.instagram && <a className="btn btn-ghost" href={CLUB.links.instagram}>Instagram</a>}
        {CLUB.links.linkedin && <a className="btn btn-ghost" href={CLUB.links.linkedin}>LinkedIn</a>}
        <Link className="btn btn-ghost" href="/">Club website</Link>
      </div>
    </>
  );
}
