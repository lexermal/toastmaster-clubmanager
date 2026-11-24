import { redirect } from 'next/navigation';
import { currentMeeting } from '@/lib/meetings';

export const dynamic = 'force-dynamic';

/** Target of the printed QR code: always lands on today's / the next meeting. */
export default function CurrentMeetingRedirect() {
  const meeting = currentMeeting();
  redirect(meeting ? `/m/${meeting.id}` : '/meetings');
}
