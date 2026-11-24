import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { CLUB } from '@/lib/club';
import { MEMBER_BENEFITS, MEMBERSHIP_STEPS } from '../content';

export const metadata: Metadata = { title: 'Membership' };

export default function MembershipPage() {
  return (
    <>
      <PageHeader
        eyebrow="Membership"
        title={<>From guest to <span className="italic text-maroon">speaker.</span></>}
        intro="Visit as often as you like for free. When you are ready to give your first speech, join the club — it takes a few minutes."
      />
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <ol className="grid gap-5 md:grid-cols-4">
          {MEMBERSHIP_STEPS.map((s, i) => (
            <li key={s.title} className="rounded-3xl border border-line bg-card p-6">
              <span className="font-display text-4xl font-semibold text-maroon">{i + 1}</span>
              <h2 className="mt-3 font-display text-xl font-semibold">{s.title}</h2>
              <p className="mt-2 text-ink-soft">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="mx-auto mt-20 grid max-w-6xl gap-12 px-4 sm:px-6 md:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl font-semibold">What you get</h2>
          <ul className="mt-6 space-y-3">
            {MEMBER_BENEFITS.map((b, i) => (
              <li key={b} className="flex gap-3 text-lg leading-relaxed">
                <span className="mt-2.5 size-2.5 shrink-0 rounded-full" style={{ background: ['var(--go)', 'var(--wait)', 'var(--stop)'][i % 3] }} />
                {b}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[2rem] bg-ink p-8 text-paper">
          <h2 className="font-display text-3xl font-semibold">Fees</h2>
          <dl className="mt-6 divide-y divide-paper/15">
            {CLUB.fees.map((f) => (
              <div key={f.label} className="flex justify-between gap-4 py-3">
                <dt className="text-paper/75">{f.label}</dt>
                <dd className="font-mono">{f.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-paper/60">{CLUB.feesNote}</p>
          <a href={`mailto:${CLUB.email}?subject=I%20want%20to%20join`} className="btn mt-8 bg-paper text-ink">Request membership</a>
        </div>
      </section>
    </>
  );
}
