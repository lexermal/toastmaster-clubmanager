import { desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { AhCounter } from '@/components/tools/AhCounter';
import { db, schema } from '@/lib/db';
import { peopleFor, toolMeeting } from '../data';

export default async function AhCounterPage({ searchParams }: { searchParams: Promise<{ meeting?: string }> }) {
  const meeting = await toolMeeting(searchParams);
  if (!meeting) redirect('/tools');
  const history = db.select().from(schema.fillerCounts).where(eq(schema.fillerCounts.meetingId, meeting.id)).orderBy(desc(schema.fillerCounts.id)).all();
  return <AhCounter meetingId={meeting.id} people={peopleFor(meeting.id)} history={history} />;
}
