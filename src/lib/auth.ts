import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sign, verify } from './signing';

/** "tools" = timekeeper / ah-counter / recorder; "admin" = everything, including tools. */
export type Access = 'tools' | 'admin';
const COOKIE = 'club_access';

/** Which access level a password grants, if any. */
export function accessForPassword(password: string): Access | undefined {
  if (process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) return 'admin';
  if (process.env.TOOLS_PASSWORD && password === process.env.TOOLS_PASSWORD) return 'tools';
}

export async function grantAccess(access: Access) {
  (await cookies()).set(COOKIE, `${access}.${sign(access)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.PUBLIC_URL?.startsWith('https') ?? false,
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
}

export async function revokeAccess() {
  (await cookies()).delete(COOKIE);
}

export async function currentAccess(): Promise<Access | undefined> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return;
  const [access, sig] = raw.split('.');
  if ((access === 'tools' || access === 'admin') && sig && verify(access, sig)) return access;
}

/** Call at the top of every protected page AND server action / route handler. */
export async function requireAccess(level: Access, returnTo = level === 'admin' ? '/admin' : '/tools') {
  const access = await currentAccess();
  if (access === 'admin' || access === level) return access;
  redirect(`/login?next=${encodeURIComponent(returnTo)}`);
}
