// src/components/layout/dashboard-shell.tsx

'use client';

import { useEffect, useState } from 'react';

import { MobileWarning } from '@/components/shared/mobile-warning';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [hasProceeded, setHasProceeded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkScreen = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkScreen();

    window.addEventListener('resize', checkScreen);

    return () => {
      window.removeEventListener('resize', checkScreen);
    };
  }, []);

  if (isMobile && !hasProceeded) {
    return <MobileWarning onProceed={() => setHasProceeded(true)} />;
  }

  return <>{children}</>;
}
