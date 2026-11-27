import { CLUB } from '../lib/club';

const MIN = 60_000;
const HOUR = 60 * MIN;

export interface ScheduledMeeting {
  startsAt: Date;
  endsAt: Date;
}

/** YYYY-MM-DD of a moment in the club's time zone. */
export function clubDay(t: number | Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: CLUB.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
}

/** "YYYY-MM-DD" + "HH:MM" in the club's time zone → the absolute moment. */
export function clubTimeToDate(date: string, time: string) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Offset of the club's zone at that moment (handles summer time): format the guess back in the zone.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: CLUB.timezone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(asUtc)
      .map((p) => [p.type, Number(p.value)]),
  );
  const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return new Date(asUtc - (shown - asUtc));
}

/**
 * How often to sync with WordPress right now:
 * - every 6 hours normally;
 * - on a meeting day every hour, until 3 hours before the start;
 * - then every 15 minutes (until the meeting has ended);
 * - every minute from 20 minutes before to 20 minutes after the start.
 */
export function wpSyncInterval(now: number, meetings: ScheduledMeeting[]) {
  let interval = 6 * HOUR;
  for (const m of meetings) {
    if (clubDay(m.startsAt) !== clubDay(now)) continue;
    const start = m.startsAt.getTime();
    let i = HOUR;
    if (Math.abs(now - start) <= 20 * MIN) i = MIN;
    else if (now >= start - 3 * HOUR && now < m.endsAt.getTime()) i = 15 * MIN;
    interval = Math.min(interval, i);
  }
  return interval;
}

/** True while only the meetings of the day need syncing (the fast intervals). */
export const isMeetingWindow = (now: number, meetings: ScheduledMeeting[]) => wpSyncInterval(now, meetings) < HOUR;

/**
 * When the next sync is due after one at `last`. Never sleeps past the moment a faster interval
 * starts (3 hours and 20 minutes before a start), so a 6 hour wait can't swallow the meeting.
 */
export function nextWpSyncAt(last: number, meetings: ScheduledMeeting[]) {
  let next = last + wpSyncInterval(last, meetings);
  for (const m of meetings) {
    for (const edge of [m.startsAt.getTime() - 3 * HOUR, m.startsAt.getTime() - 20 * MIN]) {
      if (edge > last && edge < next) next = edge;
    }
  }
  return next;
}
