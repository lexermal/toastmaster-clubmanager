import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { TimingLights } from '@/components/TimingLights';
import { ROLES_URL } from '@/lib/club';
import { db, schema } from '@/lib/db';
import { formatMeetingDate, formatTime } from '@/lib/format';
import { getMeeting, roleLabel } from '@/lib/meetings';
import { guideForRole } from '@/lib/roles';
import { readClaimToken } from '@/lib/tokens';
import { ClaimButton } from './ClaimButton';

export const dynamic = 'force-dynamic';

// GET only shows the role: WhatsApp fetches links for previews, so claiming needs the button press.
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claim = readClaimToken(token);
  if (!claim) notFound();
  const role = db.select().from(schema.meetingRoles).where(eq(schema.meetingRoles.id, claim.meetingRoleId)).get();
  const member = db.select().from(schema.members).where(eq(schema.members.id, claim.memberId)).get();
  const meeting = role && getMeeting(role.meetingId);
  if (!role || !member || !meeting) notFound();
  const guide = guideForRole(role.role);
  const state = role.memberId === member.id ? 'yours' : role.memberId ? 'taken' : 'open';

  return (
    <div className="grain flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[1.75rem] border border-line bg-card p-7 text-center">
        <TimingLights size={9} />
        <p className="mt-5 text-sm text-ink-soft">Hi {member.name.split(' ')[0]}, take this role?</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">{roleLabel(role)}</h1>
        <p className="mt-2 text-ink-soft">
          {formatMeetingDate(meeting.startsAt)} · {formatTime(meeting.startsAt)}
        </p>
        {guide && <p className="mt-4 text-sm leading-relaxed">{guide.summary}</p>}
        <div className="mt-6">
          {state === 'open' && <ClaimButton token={token} />}
          {state === 'yours' && <p className="rounded-xl bg-go/10 p-3 font-semibold">It’s yours — see you there! ✅</p>}
          {state === 'taken' && <p className="rounded-xl bg-wait/15 p-3">Someone was faster. Reply “roles” to the club bot for other open roles.</p>}
        </div>
        {guide && <a href={ROLES_URL} className="mt-4 inline-block text-sm text-maroon underline underline-offset-4">How the role works</a>}
      </div>
    </div>
  );
}
