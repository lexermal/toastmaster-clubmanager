import Link from 'next/link';
import { TimingLights } from '@/components/TimingLights';
import { requireAccess } from '@/lib/auth';
import { logout } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAccess('admin');
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-card print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm sm:px-6">
          <Link href="/admin" className="flex items-center gap-2 font-display text-lg font-semibold">
            <TimingLights size={7} /> Club admin
          </Link>
          <nav className="flex flex-1 gap-5 text-ink-soft">
            <Link href="/admin" className="hover:text-ink">Dashboard</Link>
            <Link href="/admin/members" className="hover:text-ink">Members</Link>
            <Link href="/tools" className="hover:text-ink">Tools</Link>
            <Link href="/" className="hover:text-ink">Website</Link>
          </nav>
          <form action={logout}><button className="text-ink-soft hover:text-ink">Log out</button></form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
