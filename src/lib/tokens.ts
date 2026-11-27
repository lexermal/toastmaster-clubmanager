import { sign, verify } from './signing';

/**
 * One-click role claim links sent on WhatsApp: "member X takes meeting-role Y".
 * Signed so a forwarded link can't be edited to claim for someone else.
 */
export function claimToken(memberId: number, meetingRoleId: number) {
  const payload = `${memberId}-${meetingRoleId}`;
  return `${payload}.${sign(`claim:${payload}`)}`;
}

export function readClaimToken(token: string): { memberId: number; meetingRoleId: number } | undefined {
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !verify(`claim:${payload}`, sig)) return;
  const [memberId, meetingRoleId] = payload.split('-').map(Number);
  if (Number.isInteger(memberId) && Number.isInteger(meetingRoleId)) return { memberId, meetingRoleId };
}
