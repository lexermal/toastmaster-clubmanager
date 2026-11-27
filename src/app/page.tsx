import { redirect } from 'next/navigation';
import { WEBSITE_URL } from '@/lib/club';

// The public website is WordPress; this app only serves admin and claim links.
export default function Root() {
  redirect(WEBSITE_URL);
}
