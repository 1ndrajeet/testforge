import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getSession } from '@/lib/session';

import { TooltipProvider } from '@/components/ui/tooltip';

import { DashboardShell } from '@/components/layout/dashboard-shell';
import { HeaderWrapper } from '@/components/layout/header-wrapper';
import { Sidebar } from '@/components/layout/sidebar';

import { TutorialProvider } from '@/components/tutorial/TutorialProvider';

const ONBOARDING_COOKIE = 'onboarding_complete';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  const cookieStore = await cookies();
  const onboardingComplete = cookieStore.get(ONBOARDING_COOKIE)?.value === 'true';

  if (!onboardingComplete) {
    redirect('/onboarding');
  }

  return (
    <TooltipProvider>
      <TutorialProvider>
        <DashboardShell>
          <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
            <HeaderWrapper />
            <Sidebar />

            <main className="pt-0">
              <div className="container mx-auto p-4 lg:p-6">{children}</div>
            </main>
          </div>
        </DashboardShell>
      </TutorialProvider>
    </TooltipProvider>
  );
}
