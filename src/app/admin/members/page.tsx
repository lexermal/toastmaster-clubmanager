import { asc } from 'drizzle-orm';
import { Card } from '@/components/Card';
import { db, schema } from '@/lib/db';
import { savePhone, toggleMuted } from '../actions';

export default function MembersPage() {
  const all = db.select().from(schema.members).orderBy(asc(schema.members.name)).all();
  const members = all.filter((m) => !m.isGuest);
  const guests = all.filter((m) => m.isGuest);
  const missing = members.filter((m) => !m.phone).length;

  const row = (m: (typeof all)[number]) => (
    <li key={m.id} className="grid items-center gap-2 py-3 sm:grid-cols-[1fr_1.2fr_auto]">
      <span>
        <span className="font-semibold">{m.name}</span>
        {m.clubRoles.filter((r) => r !== 'Member').length > 0 && (
          <span className="ml-2 text-xs text-ink-soft">{m.clubRoles.filter((r) => r !== 'Member').join(', ')}</span>
        )}
      </span>
      <form action={savePhone} className="flex gap-2">
        <input type="hidden" name="id" value={m.id} />
        <input name="phone" defaultValue={m.phone ? `+${m.phone}` : ''} placeholder="+46…" className="field !py-1.5" />
        <button className="btn btn-ghost !px-3 !py-1.5 text-sm">Save</button>
      </form>
      <form action={toggleMuted.bind(null, m.id, !m.muted)}>
        <button className={`text-sm ${m.muted ? 'text-stop' : 'text-ink-soft'}`}>{m.muted ? 'Muted' : 'Mute'}</button>
      </form>
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <Card title={`Members (${members.length})`}>
        <p className="mb-2 text-sm text-ink-soft">
          Synced from tmclub.eu. Add WhatsApp numbers so members get reminders and recaps{missing ? ` — ${missing} still missing` : ''}. Members can also link themselves by messaging the bot “I am &lt;full name&gt;”.
        </p>
        <ul className="divide-y divide-line">{members.map(row)}</ul>
      </Card>
      <Card title={`Guests (${guests.length})`}>
        <ul className="divide-y divide-line">{guests.map(row)}</ul>
        {!guests.length && <p className="text-ink-soft">No guests yet.</p>}
      </Card>
    </div>
  );
}
