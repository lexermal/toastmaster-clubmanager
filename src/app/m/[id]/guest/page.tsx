import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMeeting } from '@/lib/meetings';
import { GuestForm } from './GuestForm';

export const dynamic = 'force-dynamic';

export default async function GuestPage({ params }: { params: Promise<{ id: string }> }) {
  const meeting = getMeeting(Number((await params).id));
  if (!meeting) notFound();
  return (
    <>
      <Link href={`/m/${meeting.id}`} className="mt-6 inline-block text-sm text-ink-soft">← Back</Link>
      <h1 className="mt-3 font-display text-3xl font-semibold">Welcome, guest!</h1>
      <p className="mt-2 text-ink-soft">
        Check in so we can say hello. Add your WhatsApp number and you’ll get a personal recap after the meeting — including feedback if you try a Table Topic.
      </p>
      <GuestForm meetingId={meeting.id} />
    </>
  );
}
