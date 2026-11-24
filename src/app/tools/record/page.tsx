import { desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { Recorder } from '@/components/tools/Recorder';
import { db, schema } from '@/lib/db';
import { meetingTargets } from '@/lib/targets';
import { toolMeeting } from '../data';

export default async function RecordPage({ searchParams }: { searchParams: Promise<{ meeting?: string }> }) {
  const meeting = await toolMeeting(searchParams);
  if (!meeting) redirect('/tools');
  const rows = db
    .select({ e: schema.evaluations, name: schema.members.name })
    .from(schema.evaluations)
    .innerJoin(schema.members, eq(schema.evaluations.memberId, schema.members.id))
    .where(eq(schema.evaluations.meetingId, meeting.id))
    .orderBy(desc(schema.evaluations.id))
    .all()
    .map(({ e, name }) => ({ id: e.id, name, about: e.about, evaluatorName: e.evaluatorName, status: e.status, summary: e.summary, error: e.error }));
  return <Recorder meetingId={meeting.id} targets={meetingTargets(meeting.id)} rows={rows} />;
}
