import { requireAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ToolsLayout({ children }: { children: React.ReactNode }) {
  await requireAccess('tools');
  return <div className="min-h-dvh">{children}</div>;
}
