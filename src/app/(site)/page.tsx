import Link from 'next/link';
import { NextMeetingCard } from '@/components/NextMeetingCard';
import { TimingLights } from '@/components/TimingLights';
import { CLUB } from '@/lib/club';
import { ROLE_GUIDES } from '@/lib/roles';
import { EVENING, FIRST_VISIT_FAQ } from './content';

export const dynamic = 'force-dynamic';

const PILLARS = [
  {
    n: '01',
    title: 'Speak more often',
    text: 'Every meeting gives you a chance to talk: a prepared speech, a two-minute impromptu answer, or a short report. Small reps add up fast.',
  },
  {
    n: '02',
    title: 'Get honest, kind feedback',
    text: 'Each speech gets a spoken evaluation plus anonymous notes from the room — sent to you on WhatsApp after the meeting, with your timing.',
  },
  {
    n: '03',
    title: 'Lead in a safe room',
    text: 'Host the evening, run Table Topics, keep time. Club roles are low-stakes practice for leading real meetings at work.',
  },
];

const MARQUEE = ['Ice Breaker', 'Table Topics', 'Evaluation', 'Word of the Day', 'Timekeeper', 'Ah-Counter', 'Pathways', 'Vocal Variety', 'Storytelling', 'Persuasive speaking'];

export default function Home() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <BridgeArc />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 md:grid-cols-[1.25fr_1fr] md:pb-28 md:pt-24">
          <div>
            <p className="rise flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em] text-ink-soft">
              <TimingLights size={8} /> English-speaking club · {CLUB.city}
            </p>
            <h1 className="rise mt-6 font-display text-[clamp(3rem,9vw,6.4rem)] font-semibold leading-[0.92] tracking-[-0.03em]" style={{ animationDelay: '80ms' }}>
              Say it
              <br />
              <span className="italic text-maroon" style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}>
                out loud.
              </span>
            </h1>
            <p className="rise mt-7 max-w-xl text-lg leading-relaxed text-ink-soft" style={{ animationDelay: '160ms' }}>
              {CLUB.name} is where people in {CLUB.city} practise public speaking, get real feedback and grow as leaders — every
              second Monday, in English, with a room that wants you to do well.
            </p>
            <div className="rise mt-9 flex flex-wrap gap-3" style={{ animationDelay: '240ms' }}>
              <Link href="/meetings#visit" className="btn btn-primary">
                Come to a meeting — it’s free
              </Link>
              <Link href="/membership" className="btn btn-ghost">
                How membership works
              </Link>
            </div>
          </div>
          <div className="rise" style={{ animationDelay: '320ms' }}>
            <NextMeetingCard />
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="overflow-hidden border-y border-line bg-ink py-4 text-paper" aria-hidden>
        <div className="flex w-max animate-[marquee_40s_linear_infinite] gap-10 whitespace-nowrap font-display text-2xl italic">
          {[...MARQUEE, ...MARQUEE].map((w, i) => (
            <span key={i} className="flex items-center gap-10">
              {w}
              <span className="inline-block size-2 rounded-full" style={{ background: ['var(--go)', 'var(--wait)', 'var(--stop)'][i % 3] }} />
            </span>
          ))}
        </div>
        <style>{`@keyframes marquee { to { transform: translateX(-50%); } }`}</style>
      </div>

      {/* PILLARS */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <h2 className="max-w-2xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Confidence isn’t a talent. <span className="italic text-maroon">It’s practice.</span>
        </h2>
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.n} className="border-t-2 border-ink pt-5">
              <span className="font-mono text-sm text-maroon">{p.n}</span>
              <h3 className="mt-3 font-display text-2xl font-semibold">{p.title}</h3>
              <p className="mt-3 leading-relaxed text-ink-soft">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AN EVENING */}
      <section className="bg-paper-2 py-24">
        <div className="mx-auto grid max-w-6xl gap-14 px-4 sm:px-6 md:grid-cols-[1fr_1.4fr]">
          <div className="md:sticky md:top-28 md:self-start">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-ink-soft">Your first visit</p>
            <h2 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight">What happens on a meeting night</h2>
            <p className="mt-4 leading-relaxed text-ink-soft">
              Two hours, a clear agenda and a lot of applause. As a guest you can just watch — or try a Table Topic if you feel brave.
            </p>
          </div>
          <ol className="relative border-l-2 border-line">
            {EVENING.map((e, i) => (
              <li key={e.title} className="relative pb-10 pl-8 last:pb-0">
                <span
                  className="absolute -left-[9px] top-1.5 size-4 rounded-full border-4 border-paper-2"
                  style={{ background: ['var(--go)', 'var(--wait)', 'var(--stop)'][i % 3] }}
                />
                <span className="font-mono text-sm text-ink-soft">{e.time}</span>
                <h3 className="mt-1 font-display text-xl font-semibold">{e.title}</h3>
                <p className="mt-1.5 leading-relaxed text-ink-soft">{e.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ROLES */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="max-w-xl font-display text-4xl font-semibold leading-tight tracking-tight">Every evening runs on member roles</h2>
          <Link href="/roles" className="font-semibold text-maroon underline-offset-4 hover:underline">
            All role guides →
          </Link>
        </div>
        <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {ROLE_GUIDES.map((r) => (
            <Link key={r.slug} href={`/roles/${r.slug}`} className="group bg-card p-6 transition-colors hover:bg-paper">
              <span className="font-mono text-xs text-ink-soft">Level {r.level}</span>
              <h3 className="mt-2 font-display text-xl font-semibold group-hover:text-maroon">{r.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.summary}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 className="font-display text-4xl font-semibold tracking-tight">Good to know</h2>
        <div className="mt-8 divide-y divide-line border-y border-line">
          {FIRST_VISIT_FAQ.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-semibold">
                {f.q}
                <span className="text-2xl text-maroon transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 leading-relaxed text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto mt-24 max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-maroon px-6 py-16 text-maroon-ink sm:px-14">
          <TimingLights size={12} className="mb-6" />
          <h2 className="max-w-2xl font-display text-4xl font-semibold leading-tight sm:text-5xl">
            The hardest part is walking in. We’ll take it from there.
          </h2>
          <Link href="/meetings#visit" className="btn mt-8 bg-maroon-ink text-maroon">
            See the next meeting
          </Link>
        </div>
      </section>
    </>
  );
}

/** A single sweeping line, a nod to the Öresund bridge. */
function BridgeArc() {
  return (
    <svg className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[70%] w-full text-line" viewBox="0 0 1200 400" preserveAspectRatio="none" aria-hidden>
      <path d="M-20 360 C 300 120, 900 120, 1220 360" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {Array.from({ length: 23 }, (_, i) => {
        const x = 40 + i * 50;
        const t = (x + 20) / 1240;
        const y = 360 - 4 * t * (1 - t) * 180;
        return <line key={i} x1={x} y1={y} x2={x} y2={370} stroke="currentColor" strokeWidth="0.8" />;
      })}
      <line x1="0" y1="372" x2="1200" y2="372" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
