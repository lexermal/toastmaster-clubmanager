/** Fills an empty local database with demo members and two meetings. Dev only: `pnpm seed:demo`. */
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
const { db, schema } = await import('../src/lib/db');

if (db.select().from(schema.meetings).get()) {
  console.log('Database already has meetings — not seeding.');
  process.exit(0);
}

const names = ['Anna Lindqvist', 'Omar Haddad', 'Sofia Romero', 'Jonas Berg', 'Priya Nair', 'Lukas Weber', 'Emma Karlsson', 'Daniel Okafor'];
const members = names.map((name, i) =>
  db.insert(schema.members).values({ name, tmUserId: String(9000 + i), clubRoles: i === 0 ? ['President'] : i === 1 ? ['VP Education'] : ['Member'] }).returning().get(),
);

const today = new Date();
today.setHours(17, 45, 0, 0);
const next = new Date(today.getTime() + 14 * 24 * 3600_000);

const ROLES: [string, number][] = [
  ['Toastmaster', 0], ['General Evaluator', 0], ['Timekeeper', 0], ['Ah-Counter', 0], ['Grammarian', 0],
  ['Table Topics Master', 0], ['Speaker', 1], ['Speaker', 2], ['Evaluator', 1], ['Evaluator', 2],
];

for (const [i, startsAt] of [today, next].entries()) {
  const meeting = db
    .insert(schema.meetings)
    .values({ startsAt, number: 412 + i, theme: i === 0 ? 'Turning points' : 'Light & shadow', wordOfTheDay: i === 0 ? 'serendipity' : 'luminous', venue: 'Studieförbundet Vuxenskolan', status: i === 0 ? 'live' : 'scheduled' })
    .returning()
    .get();
  ROLES.forEach(([role, slot], j) => {
    const member = i === 0 ? members[j % members.length] : j % 3 === 0 ? members[(j + 2) % members.length] : null;
    db.insert(schema.meetingRoles).values({ meetingId: meeting.id, role, slot, roleItemId: String(100 + j), memberId: member?.id ?? null, details: role === 'Speaker' ? 'Ice Breaker — "Why I moved to Malmö"' : null }).run();
  });
}
console.log('Seeded demo data.');
