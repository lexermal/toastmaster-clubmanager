import type { Metadata } from 'next';
import { ne } from 'drizzle-orm';
import { PageHeader } from '@/components/PageHeader';
import { CLUB } from '@/lib/club';
import { db, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'About' };

export default function AboutPage() {
  // Officers come from the club roster on easy-Speak.
  const officers = db
    .select()
    .from(schema.members)
    .where(ne(schema.members.isGuest, true))
    .all()
    .filter((m) => m.clubRoles.some((r) => r !== 'Member'));
  return (
    <>
      <PageHeader
        eyebrow="About us"
        title={<>A small club with <span className="italic text-maroon">a big room.</span></>}
        intro={`${CLUB.name} brings together people from all over the world who live in and around ${CLUB.city} — students, engineers, founders, teachers — to get better at speaking and leading, in English.`}
      />
      <section className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 md:grid-cols-2">
        <div className="space-y-5 text-lg leading-relaxed">
          <p>
            We are part of <strong>Toastmasters International</strong>, a non-profit founded in 1924 that has helped millions of people
            become confident speakers. Every club runs on the same simple idea: learn by doing, in a supportive room, with structured feedback.
          </p>
          <p>
            Members follow <strong>Pathways</strong>, a self-paced learning programme. You choose a path — like Presentation Mastery or
            Dynamic Leadership — and give speeches at your own pace. Between speeches you take meeting roles, which build leadership skills.
          </p>
          <p>
            The club is run by volunteers elected every year. Want to help? Ask any officer at a meeting.
          </p>
        </div>
        {officers.length > 0 && (
          <div>
            <h2 className="font-display text-3xl font-semibold">Club officers</h2>
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {officers.map((o) => (
                <li key={o.id} className="flex flex-wrap justify-between gap-2 py-3">
                  <span className="font-semibold">{o.name}</span>
                  <span className="text-ink-soft">{o.clubRoles.filter((r) => r !== 'Member').join(', ')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}
