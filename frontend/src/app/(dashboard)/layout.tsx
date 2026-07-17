// src/app/(dashboard)/layout.tsx
import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';

import { TooltipProvider } from '@/components/ui/tooltip';

import { DashboardShell } from '@/components/layout/dashboard-shell';
import { HeaderWrapper } from '@/components/layout/header-wrapper';
import { Sidebar } from '@/components/layout/sidebar';

import { TutorialProvider } from '@/components/tutorial/TutorialProvider';

const ONBOARDING_COOKIE = 'onboarding_complete';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  // Quick cookie check - middleware already handles the heavy lifting
  const cookieStore = await cookies();
  const onboardingComplete = cookieStore.get(ONBOARDING_COOKIE)?.value === 'true';

  // Safety net: if cookie is missing but middleware didn't catch it
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
