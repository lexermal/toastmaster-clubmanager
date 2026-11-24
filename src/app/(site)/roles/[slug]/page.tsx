import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { ROLE_GUIDES, TIMING_PRESETS, formatDuration } from '@/lib/roles';

export function generateStaticParams() {
  return ROLE_GUIDES.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const role = ROLE_GUIDES.find((r) => r.slug === slug);
  return { title: role ? `${role.name} — role guide` : 'Role guide' };
}

function List({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <section className="rounded-3xl border border-line bg-card p-6">
      <h2 className="flex items-center gap-3 font-display text-2xl font-semibold">
        <span className="size-3 rounded-full" style={{ background: color }} />
        {title}
      </h2>
      <ul className="mt-4 space-y-3">
        {items.map((i) => (
          <li key={i} className="flex gap-3 leading-relaxed">
            <span className="mt-2.5 h-px w-4 shrink-0 bg-ink-soft" />
            {i}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function RoleGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const role = ROLE_GUIDES.find((r) => r.slug === slug);
  if (!role) notFound();
  const idx = ROLE_GUIDES.indexOf(role);
  const next = ROLE_GUIDES[idx + 1];
  return (
    <>
      <PageHeader eyebrow={`Role guide · level ${role.level}`} title={role.name} intro={role.summary} />
      <div className="mx-auto grid max-w-6xl gap-5 px-4 sm:px-6 md:grid-cols-3">
        <List title="Before the meeting" items={role.before} color="var(--go)" />
        <List title="During the meeting" items={role.during} color="var(--wait)" />
        <List title="Tips" items={role.tips} color="var(--stop)" />
      </div>
      {(role.slug === 'timekeeper' || role.slug === 'speaker') && (
        <section className="mx-auto mt-10 max-w-6xl px-4 sm:px-6">
          <h2 className="font-display text-2xl font-semibold">Timing signals</h2>
          <div className="mt-4 overflow-x-auto rounded-3xl border border-line bg-card">
            <table className="w-full text-left text-sm">
              <thead className="text-ink-soft">
                <tr><th className="p-4">Type</th><th className="p-4">Green</th><th className="p-4">Amber</th><th className="p-4">Red</th></tr>
              </thead>
              <tbody className="font-mono">
                {TIMING_PRESETS.map((p) => (
                  <tr key={p.key} className="border-t border-line">
                    <td className="p-4 font-sans">{p.label}</td>
                    <td className="p-4">{formatDuration(p.green)}</td>
                    <td className="p-4">{formatDuration(p.amber)}</td>
                    <td className="p-4">{formatDuration(p.red)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-ink-soft">Within 30 seconds either side of the window counts as on time.</p>
        </section>
      )}
      <div className="mx-auto mt-12 flex max-w-6xl flex-wrap justify-between gap-4 px-4 sm:px-6">
        <Link href="/roles" className="btn btn-ghost">← All roles</Link>
        {next && <Link href={`/roles/${next.slug}`} className="btn btn-ghost">Next step: {next.name} →</Link>}
      </div>
    </>
  );
}
