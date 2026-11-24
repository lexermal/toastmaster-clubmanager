import { CLUB } from './club';

export function formatMeetingDate(date: Date, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: CLUB.timezone,
    ...opts,
  }).format(date);
}

export function formatTime(date: Date) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: CLUB.timezone }).format(date);
}
