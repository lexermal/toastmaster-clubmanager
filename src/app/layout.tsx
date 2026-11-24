import type { Metadata, Viewport } from 'next';
import { Fraunces, IBM_Plex_Mono, Instrument_Sans } from 'next/font/google';
import { CLUB } from '@/lib/club';
import './globals.css';

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', axes: ['SOFT', 'WONK', 'opsz'] });
const instrument = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-plex-mono' });

export const metadata: Metadata = {
  title: { default: `${CLUB.name} — public speaking in English`, template: `%s · ${CLUB.name}` },
  description: `${CLUB.name}: an English-speaking Toastmasters club in ${CLUB.city}. Practise public speaking and leadership in a friendly, supportive room. Guests welcome.`,
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5efe4' },
    { media: '(prefers-color-scheme: dark)', color: '#15110f' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${instrument.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
