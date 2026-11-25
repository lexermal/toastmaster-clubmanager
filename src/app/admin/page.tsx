import { and, desc, eq, gt } from 'drizzle-orm';
import Link from 'next/link';
import QRCode from 'qrcode';
import { AutoRefresh } from '@/components/AutoRefresh';
import { Card } from '@/components/Card';
import { db, schema } from '@/lib/db';
import { formatMeetingDate, formatTime } from '@/lib/format';
import { getSetting } from '@/lib/settings';
import { cancelOutbox, chooseGroup, requestSync, retryOutbox, retryTmJob, sendTestMessage } from './actions';

const STATUS: Record<string, string> = {
  connected: 'Connected',
  'waiting-for-scan': 'Scan the QR code',
  reconnecting: 'Reconnecting…',
  'logged-out': 'Logged out — delete data/whatsapp-auth and restart the worker',
};

export default async function AdminDashboard() {
  const waStatus = getSetting('wa_status');
  const qr = getSetting('wa_qr');
  const qrSvg = qr ? await QRCode.toString(qr, { type: 'svg', margin: 1 }) : null;
  const groups: { jid: string; subject: string }[] = JSON.parse(getSetting('wa_groups') ?? '[]');
  const groupJid = getSetting('wa_group_jid');
  const lastSync = getSetting('tm_last_sync');
  const syncError = getSetting('tm_sync_error');
  const syncRequested = getSetting('tm_sync_requested') === '1';

  const pendingJobs = db.select().from(schema.tmJobs).where(eq(schema.tmJobs.status, 'pending')).all().length;
  // Recent failures only; old ones are history.
  const failedJobs = db
    .select()
    .from(schema.tmJobs)
    .where(and(eq(schema.tmJobs.status, 'error'), gt(schema.tmJobs.createdAt, new Date(Date.now() - 7 * 24 * 3600_000))))
    .orderBy(desc(schema.tmJobs.id))
    .limit(5)
    .all();
  const meetings = db.select().from(schema.meetings).orderBy(desc(schema.meetings.startsAt)).limit(12).all();
  const outbox = db.select().from(schema.outbox).orderBy(desc(schema.outbox.id)).limit(40).all();
  const recipients = new Map(
    db.select({ id: schema.members.id, name: schema.members.name }).from(schema.members).all().map((m) => [m.id, m.name]),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      {(waStatus !== 'connected' || syncRequested) && <AutoRefresh every={4000} />}
      <div className="flex flex-col gap-6">
        <Card title="WhatsApp">
          <p className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${waStatus === 'connected' ? 'bg-go' : 'bg-wait'}`} />
            {STATUS[waStatus ?? ''] ?? 'Worker not running'}
          </p>
          {qrSvg && (
            <div className="mt-4">
              <div className="w-56 rounded-2xl bg-white p-3" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <p className="mt-2 text-sm text-ink-soft">WhatsApp on the club phone → Linked devices → Link a device.</p>
            </div>
          )}
          {waStatus === 'connected' && (
            <form action={chooseGroup} className="mt-4 flex flex-col gap-2">
              <label className="text-sm font-semibold" htmlFor="jid">Club group chat</label>
              <select id="jid" name="jid" defaultValue={groupJid ?? ''} className="field">
                <option value="">— none (no group messages) —</option>
                {groups.map((g) => <option key={g.jid} value={g.jid}>{g.subject}</option>)}
              </select>
              <button className="btn btn-ghost self-start">Save group</button>
            </form>
          )}
          <form action={sendTestMessage} className="mt-5 flex gap-2 border-t border-line pt-4">
            <input name="phone" placeholder="+46… test message" className="field" />
            <button className="btn btn-ghost shrink-0">Send</button>
          </form>
        </Card>

        <Card title="tmclub.eu sync" action={<form action={requestSync}><button className="btn btn-ghost !py-1.5 text-sm" disabled={syncRequested}>{syncRequested ? 'Syncing…' : 'Sync now'}</button></form>}>
          <p className="text-sm">
            Last sync: {lastSync ? `${new Date(lastSync).toLocaleString('en-GB')} (${ago(lastSync)})` : 'never'}
          </p>
          {syncError && <p className="mt-2 text-sm text-stop">Last error: {syncError}</p>}
          <p className="mt-2 text-sm">
            {pendingJobs ? `${pendingJobs} role change${pendingJobs === 1 ? '' : 's'} waiting to be written to tmclub.eu.` : 'All role changes are on tmclub.eu.'}
          </p>
          {failedJobs.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {failedJobs.map((j) => (
                <li key={j.id} className="rounded-xl border border-line p-2.5">
                  <span className="font-semibold">{j.kind === 'assignRole' ? 'Sign-up' : 'Release'} failed:</span> {j.error}
                  <form action={retryTmJob.bind(null, j.id)} className="inline">
                    <button className="ml-2 text-maroon">Retry</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-sm text-ink-soft">Syncs every 15 minutes. Sign-ups from WhatsApp are confirmed right away and written to tmclub.eu in the background, with retries.</p>
        </Card>

        <Card title="Meetings">
          <ul className="divide-y divide-line">
            {meetings.map((m) => (
              <li key={m.id}>
                <Link href={`/admin/meetings/${m.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-maroon">
                  <span>
                    {formatMeetingDate(m.startsAt, { weekday: 'short' })} · {formatTime(m.startsAt)}
                    {m.theme && <span className="block text-sm text-ink-soft">{m.theme}</span>}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${m.status === 'live' ? 'bg-stop text-white' : m.status === 'finished' ? 'bg-paper-2 text-ink-soft' : 'bg-go/15 text-go'}`}>{m.status}</span>
                </Link>
              </li>
            ))}
            {!meetings.length && <li className="py-3 text-ink-soft">No meetings yet — run a sync.</li>}
          </ul>
        </Card>
      </div>

      <Card title="Message log">
        <ul className="flex flex-col gap-3">
          {outbox.map((o) => (
            <li key={o.id} className="rounded-2xl border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {o.to === 'group' ? 'Group chat' : (o.memberId && recipients.get(o.memberId)) || `+${o.to}`}
                  <span className="ml-2 font-normal text-ink-soft">{o.kind}</span>
                </span>
                <span className="text-xs text-ink-soft">
                  {o.sentAt ? `sent ${o.sentAt.toLocaleString('en-GB')}` : o.error ? `failed ×${o.attempts}` : `queued for ${o.sendAfter.toLocaleString('en-GB')}`}
                </span>
              </div>
              <details className="mt-1">
                <summary className="cursor-pointer text-ink-soft">{o.body.slice(0, 90)}{o.body.length > 90 ? '…' : ''}</summary>
                <pre className="mt-2 whitespace-pre-wrap font-sans">{o.body}</pre>
              </details>
              {o.error && <p className="mt-1 text-stop">{o.error}</p>}
              {!o.sentAt && (
                <div className="mt-2 flex gap-4 text-xs">
                  {o.error && <form action={retryOutbox.bind(null, o.id)}><button className="text-maroon">Retry</button></form>}
                  <form action={cancelOutbox.bind(null, o.id)}><button className="text-ink-soft">Cancel</button></form>
                </div>
              )}
            </li>
          ))}
          {!outbox.length && <li className="text-ink-soft">Nothing sent yet.</li>}
        </ul>
      </Card>
    </div>
  );
}

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
