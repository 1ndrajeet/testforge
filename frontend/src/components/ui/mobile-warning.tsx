// src/components/ui/mobile-warning.tsx
'use client';

import { useEffect, useState } from 'react';

import { AlertTriangle, Maximize2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface MobileWarningProps {
  onProceed?: () => void;
}

export function MobileWarning({ onProceed }: MobileWarningProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkScreen = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  if (!isMobile) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/95 backdrop-blur-sm">
      <div className="max-w-sm p-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
        </div>
        <h2 className="mb-2 text-xl font-bold text-white">Desktop Recommended</h2>
        <p className="mb-6 text-sm text-neutral-400">
          TestForge is optimized for larger screens. Some features may not work properly on mobile
          devices.
        </p>
        <Button onClick={onProceed} className="gap-2 bg-emerald-500 hover:bg-emerald-600">
          <Maximize2 className="h-4 w-4" />
          Proceed Anyway
        </Button>
      </div>
    </div>
  );
}
