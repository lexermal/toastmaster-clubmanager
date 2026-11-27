import { count, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/Card';
import { MEETING_PAGE_URL } from '@/lib/club';
import { db, schema } from '@/lib/db';
import { formatMeetingDate, formatTime } from '@/lib/format';
import { getMeeting, meetingGuests, meetingRoles, roleLabel } from '@/lib/meetings';
import { buildSummaries } from '@/worker/summaries';
import { ActionButton } from '@/components/ActionButton';
import { pingRandomSpeaker, requeueSummaries, sendRolesPoll, setMeetingStatus } from '../../actions';

export default async function AdminMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const meeting = getMeeting(Number((await params).id));
  if (!meeting) notFound();
  const roles = meetingRoles(meeting.id);
  const guests = meetingGuests(meeting.id);
  const n = (table: typeof schema.timings | typeof schema.feedback | typeof schema.evaluations | typeof schema.votes | typeof schema.fillerCounts) =>
    db.select({ c: count() }).from(table).where(eq(table.meetingId, meeting.id)).get()?.c ?? 0;
  const stats = [
    { label: 'Timings', value: n(schema.timings) },
    { label: 'Ah-counts', value: n(schema.fillerCounts) },
    { label: 'Feedback notes', value: n(schema.feedback) },
    { label: 'Recorded evaluations', value: n(schema.evaluations) },
    { label: 'Votes', value: n(schema.votes) },
  ];
  // Preview without AI calls; the real run adds the AI summaries of audience notes.
  const previews = await buildSummaries(meeting, { ai: false });
  const statusAction = (s: 'scheduled' | 'live' | 'finished') => setMeetingStatus.bind(null, meeting.id, s);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-ink-soft">← Dashboard</Link>
          <h1 className="mt-2 font-display text-4xl font-semibold">{formatMeetingDate(meeting.startsAt)}</h1>
          <p className="text-ink-soft">{formatTime(meeting.startsAt)}{meeting.theme ? ` · ${meeting.theme}` : ''}{meeting.wordOfTheDay ? ` · Word: ${meeting.wordOfTheDay}` : ''}</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {meeting.status === 'scheduled' && <form action={statusAction('live')}><button className="btn btn-primary">Start meeting</button></form>}
          {meeting.status === 'live' && <form action={statusAction('finished')}><button className="btn btn-primary">Finish & send recaps</button></form>}
          {meeting.status === 'finished' && <form action={statusAction('live')}><button className="btn btn-ghost">Re-open</button></form>}
          {meeting.status === 'scheduled' && (
            <>
              <ActionButton action={sendRolesPoll.bind(null, meeting.id)}>📊 Role poll to group</ActionButton>
              <ActionButton action={pingRandomSpeaker.bind(null, meeting.id)}>🎲 Ping random speaker</ActionButton>
            </>
          )}
          <a href={MEETING_PAGE_URL} className="btn btn-ghost">Meeting page</a>
        </div>
      </div>

      {meeting.status === 'finished' && (
        <Card>
          <p>
            {meeting.summariesQueuedAt
              ? `Recaps queued ${meeting.summariesQueuedAt.toLocaleString('en-GB')} — see the message log.`
              : 'Recaps go out 10 minutes after finishing (late feedback still counts).'}
          </p>
          {meeting.summariesQueuedAt && (
            <form action={requeueSummaries.bind(null, meeting.id)} className="mt-2">
              <button className="text-sm text-maroon">Send to people who didn’t get one yet</button>
            </form>
          )}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-card p-4">
            <p className="font-mono text-3xl">{s.value}</p>
            <p className="text-sm text-ink-soft">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Roles">
          <ul className="divide-y divide-line text-sm">
            {roles.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 py-2">
                <span>{roleLabel(r)}</span>
                <span className="text-right">
                  {r.member?.name ?? <span className="text-ink-soft">open</span>}
                  {r.member && !r.member.phone && <span className="ml-2 text-xs text-wait">no phone</span>}
                  {r.pendingSync && <span className="ml-2 text-xs text-ink-soft">syncing…</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={`Guests (${guests.length})`}>
          <ul className="divide-y divide-line text-sm">
            {guests.map((g) => (
              <li key={g.id} className="flex justify-between py-2">
                <span>{g.name}</span>
                <span className="text-ink-soft">{g.phone ? `+${g.phone}` : 'no WhatsApp'}</span>
              </li>
            ))}
          </ul>
          {!guests.length && <p className="text-sm text-ink-soft">No guests recorded for this meeting.</p>}
        </Card>
      </div>

      <Card title={`Recap preview (${previews.length})`}>
        <div className="grid gap-4 md:grid-cols-2">
          {previews.map((p) => (
            <div key={p.member.id} className="rounded-2xl bg-[#e7f6e3] p-4 text-sm text-[#111] dark:bg-[#0b3a2c] dark:text-[#e9edef]">
              <p className="mb-2 text-xs font-semibold opacity-70">
                → {p.member.name} {p.member.phone ? `(+${p.member.phone})` : '— no phone, will not be sent'}
                {p.member.muted ? ' — muted' : ''}
              </p>
              <pre className="whitespace-pre-wrap font-sans">{p.body}</pre>
            </div>
          ))}
          {!previews.length && <p className="text-ink-soft">Nothing to summarise yet.</p>}
        </div>
      </Card>
    </div>
  );
}
