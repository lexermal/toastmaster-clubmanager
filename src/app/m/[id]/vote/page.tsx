import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMeeting } from '@/lib/meetings';
import { VOTE_CATEGORIES } from '@/lib/roles';
import { meetingTargets } from '@/lib/targets';
import { VoteForm } from './VoteForm';

export const dynamic = 'force-dynamic';

export default async function VotePage({ params }: { params: Promise<{ id: string }> }) {
  const meeting = getMeeting(Number((await params).id));
  if (!meeting) notFound();
  const targets = meetingTargets(meeting.id);
  const options = VOTE_CATEGORIES.map((c) => ({
    ...c,
    people: [...new Map(targets.filter((t) => t.group === c.key).map((t) => [t.memberId, { id: t.memberId, name: t.name, about: t.about }])).values()],
  }));
  return (
    <>
      <Link href={`/m/${meeting.id}`} className="mt-6 inline-block text-sm text-ink-soft">← Back</Link>
      <h1 className="mt-3 font-display text-3xl font-semibold">Tonight’s best</h1>
      <p className="mt-2 text-ink-soft">One vote per category. You can change it until the meeting ends.</p>
      <VoteForm meetingId={meeting.id} categories={options} disabled={meeting.status === 'finished'} />
    </>
  );
}
