'use server';

import { revalidatePath } from 'next/cache';
import { claimRole } from '@/lib/meetings';
import { readClaimToken } from '@/lib/tokens';

export async function claimFromLink(token: string): Promise<{ error?: string }> {
  const claim = readClaimToken(token);
  if (!claim) return { error: 'This link is not valid.' };
  const { error } = claimRole(claim.meetingRoleId, claim.memberId);
  revalidatePath(`/claim/${token}`);
  return { error };
}
