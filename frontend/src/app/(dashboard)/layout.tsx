// src/app/(dashboard)/layout.tsx
'use client';

import { useEffect, useState } from 'react';

import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileWarning } from '@/components/ui/mobile-warning';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [hasProceeded, setHasProceeded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkScreen = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  // If mobile and hasn't proceeded, show warning
  if (isMobile && !hasProceeded) {
    return <MobileWarning onProceed={() => setHasProceeded(true)} />;
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <Header />
        <Sidebar />
        <main className="pt-0">
          <div className="container mx-auto p-4 lg:p-6">{children}</div>
        </main>
      </div>
    </TooltipProvider>
  );
}
