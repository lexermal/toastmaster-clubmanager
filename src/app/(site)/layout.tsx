import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grain min-h-dvh">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
