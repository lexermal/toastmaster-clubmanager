import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { PrintButton } from '@/components/PrintButton';
import { TimingLights } from '@/components/TimingLights';
import { CLUB, MEETING_PAGE_URL } from '@/lib/club';
import { getMeeting } from '@/lib/meetings';

/** Printable table card. The QR points to /m, which always opens the current meeting — so one print works for every meeting. */
export default async function QrPoster({ params }: { params: Promise<{ id: string }> }) {
  const meeting = getMeeting(Number((await params).id));
  if (!meeting) notFound();
  const svg = await QRCode.toString(MEETING_PAGE_URL, { type: 'svg', margin: 0, color: { dark: '#1d1916', light: '#00000000' } });
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-[2rem] border border-line bg-[#fffaf2] p-10 text-center text-[#1d1916] print:border-0">
      <TimingLights size={12} />
      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.25em]">{CLUB.name}</p>
      <h1 className="mt-3 font-display text-4xl font-semibold leading-tight">Scan me</h1>
      <p className="mt-2">Agenda · speech feedback · voting · guest check-in</p>
      <div className="mt-8 w-64" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-6 font-mono text-sm">{MEETING_PAGE_URL.replace(/^https?:\/\//, '')}</p>
      <PrintButton />
    </div>
  );
}
