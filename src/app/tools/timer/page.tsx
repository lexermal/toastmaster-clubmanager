import { desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { Timer } from '@/components/tools/Timer';
import { db, schema } from '@/lib/db';
import { peopleFor, toolMeeting } from '../data';

export default async function TimerPage({ searchParams }: { searchParams: Promise<{ meeting?: string }> }) {
  const meeting = await toolMeeting(searchParams);
  if (!meeting) redirect('/tools');
  const history = db.select().from(schema.timings).where(eq(schema.timings.meetingId, meeting.id)).orderBy(desc(schema.timings.id)).all();
  return <Timer meetingId={meeting.id} people={peopleFor(meeting.id)} history={history} />;
}
