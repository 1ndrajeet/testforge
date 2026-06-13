// src/app/(dashboard)/layout.tsx
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { HeaderWrapper } from '@/components/layout/header-wrapper';
import { Sidebar } from '@/components/layout/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <DashboardShell>
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
          <HeaderWrapper />
          <Sidebar />

          <main className="pt-0">
            <div className="container mx-auto p-4 lg:p-6">{children}</div>
          </main>
        </div>
      </DashboardShell>
    </TooltipProvider>
  );
}
