import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { ROLE_GUIDES } from '@/lib/roles';

export const metadata: Metadata = { title: 'Meeting roles' };

export default function RolesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Role guides"
        title={<>Every role, <span className="italic text-maroon">explained.</span></>}
        intro="Ordered from a good first role to the ones that bring the whole room together. Reminders on WhatsApp link straight to these guides."
      />
      <div className="mx-auto grid max-w-6xl gap-5 px-4 sm:grid-cols-2 sm:px-6">
        {ROLE_GUIDES.map((r) => (
          <Link key={r.slug} href={`/roles/${r.slug}`} className="group flex gap-5 rounded-3xl border border-line bg-card p-6 transition hover:-translate-y-0.5 hover:border-ink-soft">
            <span className="font-display text-5xl font-semibold leading-none text-line transition-colors group-hover:text-maroon">{r.level}</span>
            <div>
              <h2 className="font-display text-2xl font-semibold">{r.name}</h2>
              <p className="mt-2 leading-relaxed text-ink-soft">{r.summary}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
