import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMeeting } from '@/lib/meetings';
import { meetingTargets } from '@/lib/targets';
import { FeedbackForm } from './FeedbackForm';

export const dynamic = 'force-dynamic';

export default async function FeedbackPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ to?: string }> }) {
  const meeting = getMeeting(Number((await params).id));
  if (!meeting) notFound();
  // Speakers first: that's who most feedback is for.
  const order = { speaker: 0, tabletopic: 1, evaluator: 2, role: 3 } as const;
  const targets = meetingTargets(meeting.id).sort((a, b) => order[a.group] - order[b.group]);
  return (
    <>
      <Link href={`/m/${meeting.id}`} className="mt-6 inline-block text-sm text-ink-soft">← Back</Link>
      <h1 className="mt-3 font-display text-3xl font-semibold">Feedback for a speaker</h1>
      <p className="mt-2 text-ink-soft">Anonymous. The speaker gets all notes on WhatsApp after the meeting.</p>
      <FeedbackForm meetingId={meeting.id} targets={targets} preselect={(await searchParams).to} />
    </>
  );
}
