import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sign, verify } from './signing';

/** Only officers log in; the meeting tools live in the WordPress plugin. */
export type Access = 'admin';
const COOKIE = 'club_access';

/** Which access level a password grants, if any. */
export function accessForPassword(password: string): Access | undefined {
  if (process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) return 'admin';
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
  if (access === 'admin' && sig && verify(access, sig)) return access;
}

/** Call at the top of every protected page AND server action / route handler. */
export async function requireAccess(level: Access, returnTo = '/admin') {
  const access = await currentAccess();
  if (access === level) return access;
  redirect(`/login?next=${encodeURIComponent(returnTo)}`);
}
