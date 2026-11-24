import Link from 'next/link';
import { TimingLights } from '@/components/TimingLights';
import { currentAccess } from '@/lib/auth';
import { formatMeetingDate } from '@/lib/format';
import { upcomingMeetings } from '@/lib/meetings';
import { toolMeeting } from './data';

const TOOLS = [
  { href: 'timer', title: 'Timer', text: 'Full-screen green / amber / red. Times go into everyone’s recap.', color: 'var(--go)' },
  { href: 'ah-counter', title: 'Ah-Counter', text: 'Tap to count filler words per speaker.', color: 'var(--wait)' },
  { href: 'record', title: 'Record evaluation', text: 'Record spoken feedback; it is transcribed and summarised for the person.', color: 'var(--stop)' },
];

export default async function ToolsHome({ searchParams }: { searchParams: Promise<{ meeting?: string }> }) {
  const meeting = await toolMeeting(searchParams);
  const access = await currentAccess();
  return (
    <div className="grain min-h-dvh">
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="flex items-center justify-between">
          <TimingLights size={9} />
          {access === 'admin' && <Link href="/admin" className="text-sm font-semibold text-maroon">Admin →</Link>}
        </div>
        <h1 className="mt-6 font-display text-4xl font-semibold">Meeting tools</h1>
        {meeting ? (
          <form className="mt-4">
            <select name="meeting" defaultValue={meeting.id} className="field" aria-label="Meeting">
              {[meeting, ...upcomingMeetings(4).filter((m) => m.id !== meeting.id)].map((m) => (
                <option key={m.id} value={m.id}>{formatMeetingDate(m.startsAt)}{m.status === 'live' ? ' (live)' : ''}</option>
              ))}
            </select>
            <button className="mt-2 text-sm text-ink-soft underline">Switch meeting</button>
          </form>
        ) : (
          <p className="mt-4 text-ink-soft">No meetings synced yet.</p>
        )}
        {meeting && (
          <div className="mt-8 flex flex-col gap-3">
            {TOOLS.map((t) => (
              <Link key={t.href} href={`/tools/${t.href}?meeting=${meeting.id}`} className="flex gap-4 rounded-2xl border border-line bg-card p-5 active:scale-[0.98]">
                <span className="w-1.5 rounded-full" style={{ background: t.color }} />
                <span>
                  <span className="block font-display text-2xl font-semibold">{t.title}</span>
                  <span className="text-sm text-ink-soft">{t.text}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
