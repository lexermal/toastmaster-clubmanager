import { redirect } from 'next/navigation';
import { TimingLights } from '@/components/TimingLights';
import { accessForPassword, grantAccess } from '@/lib/auth';

async function login(form: FormData) {
  'use server';
  const access = accessForPassword(String(form.get('password') ?? ''));
  const next = String(form.get('next') || '/tools');
  // Only same-site paths, so the login page can't be used as an open redirect.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/tools';
  if (!access) redirect(`/login?error=1&next=${encodeURIComponent(safeNext)}`);
  await grantAccess(access);
  redirect(access === 'tools' && safeNext.startsWith('/admin') ? '/tools' : safeNext);
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <div className="grain flex min-h-dvh items-center justify-center px-4">
      <form action={login} className="w-full max-w-sm rounded-[1.75rem] border border-line bg-card p-7">
        <TimingLights size={9} />
        <h1 className="mt-5 font-display text-3xl font-semibold">Member tools</h1>
        <p className="mt-2 text-sm text-ink-soft">Timer, Ah-Counter and evaluation recorder. Ask an officer for the password.</p>
        <input type="hidden" name="next" value={next ?? '/tools'} />
        <input name="password" type="password" required autoFocus placeholder="Password" className="field mt-6" />
        {error && <p className="mt-2 text-sm text-stop">Wrong password.</p>}
        <button className="btn btn-primary mt-4 w-full">Enter</button>
      </form>
    </div>
  );
}
