// components/tutorial/TutorialProvider.tsx
'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';

import { type Driver, driver } from 'driver.js';
import 'driver.js/dist/driver.css';

// ============================================================
// Types
// ============================================================

export type AllowedButton = 'next' | 'previous' | 'close';

export interface TutorialStep {
  element: string | HTMLElement | (() => Element | null);
  popover?: {
    title?: string;
    description?: string;
    side?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
    showButtons?: AllowedButton[];
    disableButtons?: AllowedButton[];
    doneBtnText?: string;
    nextBtnText?: string;
    prevBtnText?: string;
  };
  disableActiveInteraction?: boolean;
  onHighlighted?: (element?: Element, step?: any) => void;
  onDeselected?: (element?: Element, step?: any) => void;
  onNext?: (element?: Element, step?: any) => void;
  onPrev?: (element?: Element, step?: any) => void;
}

interface TutorialContextType {
  driver: Driver | null;
  startTour: (steps: TutorialStep[]) => void;
  stopTour: () => void;
  isActive: boolean;
  currentStep: number;
}

// ============================================================
// Context
// ============================================================

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

// ============================================================
// Provider
// ============================================================

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [driverInstance, setDriverInstance] = useState<Driver | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const stepsRef = useRef<TutorialStep[]>([]);

  // Initialize driver on mount
  useEffect(() => {
    const driverObj = driver({
      allowClose: true,
      showProgress: true,
      progressText: 'Step {{current}} of {{total}}',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Done ✨',
      overlayOpacity: 0.6,
      stagePadding: 10,
      stageRadius: 6,
      animate: true,
      smoothScroll: true,
      onDestroyed: () => {
        setIsActive(false);
        setCurrentStep(0);
      },
      onHighlightStarted: (element, step, options) => {
        setCurrentStep(options.state?.activeIndex || 0);
      },
    });

    setDriverInstance(driverObj);

    return () => {
      driverObj.destroy();
    };
  }, []);

  const startTour = (steps: TutorialStep[]) => {
    if (!driverInstance) return;

    // Store steps for reference
    stepsRef.current = steps;

    // Map steps to driver.js format
    const driverSteps = steps.map(step => ({
      element: step.element,
      popover: {
        title: step.popover?.title || '',
        description: step.popover?.description || '',
        side: step.popover?.side || 'bottom',
        align: step.popover?.align || 'center',
        showButtons: step.popover?.showButtons || ['next', 'previous', 'close'],
        disableButtons: step.popover?.disableButtons || [],
        doneBtnText: step.popover?.doneBtnText || 'Done ✨',
        nextBtnText: step.popover?.nextBtnText || 'Next',
        prevBtnText: step.popover?.prevBtnText || 'Back',
      },
      disableActiveInteraction: step.disableActiveInteraction || false,
      onHighlighted: step.onHighlighted,
      onDeselected: step.onDeselected,
    }));

    driverInstance.setSteps(driverSteps as any);
    driverInstance.drive();
    setIsActive(true);
  };

  const stopTour = () => {
    if (driverInstance) {
      driverInstance.destroy();
      setIsActive(false);
      setCurrentStep(0);
    }
  };

  return (
    <TutorialContext.Provider
      value={{
        driver: driverInstance,
        startTour,
        stopTour,
        isActive,
        currentStep,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
}

// ============================================================
// Hook
// ============================================================

export function useTutorial() {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
}
