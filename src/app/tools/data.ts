import { currentMeeting, getMeeting, meetingParticipants } from '@/lib/meetings';

export interface Person {
  id: number;
  name: string;
  hint: string;
  group: 'Roles' | 'Guests' | 'Members';
}

/** Meeting chosen via ?meeting=, else today's / the next one. */
export async function toolMeeting(searchParams: Promise<{ meeting?: string }>) {
  const id = Number((await searchParams).meeting);
  return (id && getMeeting(id)) || currentMeeting();
}

export function peopleFor(meetingId: number): Person[] {
  const { withRole, others, guests } = meetingParticipants(meetingId);
  return [
    ...withRole.map((p) => ({ id: p.member.id, name: p.member.name, hint: p.roles.join(', '), group: 'Roles' as const })),
    ...guests.map((g) => ({ id: g.id, name: g.name, hint: 'Guest', group: 'Guests' as const })),
    ...others.map((m) => ({ id: m.id, name: m.name, hint: '', group: 'Members' as const })),
  ];
}
