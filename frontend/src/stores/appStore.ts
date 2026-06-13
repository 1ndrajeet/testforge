// src/stores/appStore.ts
'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// This type matches what comes from the database (can be null)
export interface OrganizationFromDB {
  id: string;
  name: string;
  slug: string;
  subscriptionTier: string; // From DB as string
  subscriptionExpiresAt: Date | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  ownerId: string;
  razorpayCustomerId: string | null;
  settings: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

// This type is used in the store (transformed, with proper types)
export interface Organization {
  id: string;
  name: string;
  slug: string;
  subscriptionTier: string;
  subscriptionExpiresAt: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  ownerId: string;
  razorpayCustomerId?: string | null;
  settings?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// Database type for ExamCenter
export interface ExamCenterFromDB {
  id: string;
  code: string;
  name: string;
  orgId: string;
  address: string | null;
  officerIncharge: string | null;
  sealingSupervisor: string | null;
  distCenterCode: string | null;
  distCenterName: string | null;
  season: string | null;
  examYear: number | null;
  startDate: Date | null;
  endDate: Date | null;
  departments: string[] | null;
  isActive: boolean | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Store type for ExamCenter (optional strings, not null)
export interface ExamCenter {
  id: string;
  code: string;
  name: string;
  orgId: string;
  address?: string;
  officerIncharge?: string;
  sealingSupervisor?: string;
  distCenterCode?: string;
  distCenterName?: string;
  season?: string;
  examYear?: number;
  startDate?: string | null;
  endDate?: string | null;
  departments?: string[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Payment {
  id: string;
  orgId: string;
  planId: string;
  planName: string;
  amount: number;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
}

// Helper function to convert DB organization to store organization
export function normalizeOrganization(dbOrg: OrganizationFromDB): Organization {
  return {
    id: dbOrg.id,
    name: dbOrg.name,
    slug: dbOrg.slug,
    subscriptionTier: dbOrg.subscriptionTier,
    subscriptionExpiresAt: dbOrg.subscriptionExpiresAt?.toISOString() || null,
    trialStartedAt: dbOrg.trialStartedAt?.toISOString() || null,
    trialEndsAt: dbOrg.trialEndsAt?.toISOString() || null,
    ownerId: dbOrg.ownerId,
    razorpayCustomerId: dbOrg.razorpayCustomerId,
    settings: dbOrg.settings || undefined,
    createdAt: dbOrg.createdAt.toISOString(),
    updatedAt: dbOrg.updatedAt.toISOString(),
  };
}

// Helper function to convert DB exam center to store exam center
export function normalizeExamCenter(dbCenter: ExamCenterFromDB): ExamCenter {
  return {
    id: dbCenter.id,
    code: dbCenter.code,
    name: dbCenter.name,
    orgId: dbCenter.orgId,
    address: dbCenter.address || undefined,
    officerIncharge: dbCenter.officerIncharge || undefined,
    sealingSupervisor: dbCenter.sealingSupervisor || undefined,
    distCenterCode: dbCenter.distCenterCode || undefined,
    distCenterName: dbCenter.distCenterName || undefined,
    season: dbCenter.season || undefined,
    examYear: dbCenter.examYear || undefined,
    startDate: dbCenter.startDate?.toISOString() || null,
    endDate: dbCenter.endDate?.toISOString() || null,
    departments: dbCenter.departments || undefined,
    isActive: dbCenter.isActive || undefined,
    createdAt: dbCenter.createdAt.toISOString(),
    updatedAt: dbCenter.updatedAt.toISOString(),
  };
}

interface AppState {
  // User
  user: User | null;
  setUser: (user: User | null) => void;

  // Organization
  organization: Organization | null;
  setOrganization: (org: Organization | null) => void;
  setOrganizationFromDB: (dbOrg: OrganizationFromDB | null) => void; // New helper
  updateOrganization: (updates: Partial<Organization>) => void;

  // Exam Center
  examCenter: ExamCenter | null;
  setExamCenter: (center: ExamCenter | null) => void;
  setExamCenterFromDB: (dbCenter: ExamCenterFromDB | null) => void; // New helper
  updateExamCenter: (updates: Partial<ExamCenter>) => void;

  // Payments
  recentPayment: Payment | null;
  setRecentPayment: (payment: Payment | null) => void;

  // Onboarding Status
  onboardingComplete: boolean;
  setOnboardingComplete: (complete: boolean) => void;

  // Computed helpers
  hasActiveSubscription: () => boolean;
  isTrialActive: () => boolean;
  getDaysRemaining: () => number | null;
  needsPayment: () => boolean;

  // Actions
  logout: () => void;
  reset: () => void;
  isInitialized: boolean;
  setInitialized: (initialized: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      organization: null,
      examCenter: null,
      recentPayment: null,
      onboardingComplete: false,
      isInitialized: false,

      // Setters
      setUser: user => set({ user }),

      setOrganization: organization => set({ organization }),

      setOrganizationFromDB: dbOrg => {
        if (!dbOrg) {
          set({ organization: null });
          return;
        }
        set({ organization: normalizeOrganization(dbOrg) });
      },

      updateOrganization: updates =>
        set(state => ({
          organization: state.organization ? { ...state.organization, ...updates } : null,
        })),

      setExamCenter: examCenter => set({ examCenter }),

      setExamCenterFromDB: dbCenter => {
        if (!dbCenter) {
          set({ examCenter: null });
          return;
        }
        set({ examCenter: normalizeExamCenter(dbCenter) });
      },

      updateExamCenter: updates =>
        set(state => ({
          examCenter: state.examCenter ? { ...state.examCenter, ...updates } : null,
        })),

      setRecentPayment: recentPayment => set({ recentPayment }),

      setOnboardingComplete: onboardingComplete => set({ onboardingComplete }),

      setInitialized: isInitialized => set({ isInitialized }),

      // Computed helpers
      hasActiveSubscription: () => {
        const { organization } = get();
        if (!organization) return false;

        const expiresAt = organization.subscriptionExpiresAt;
        const hasValidExpiry = expiresAt !== null && new Date(expiresAt) > new Date();

        const isActiveTier =
          organization.subscriptionTier === 'premium' || organization.subscriptionTier === 'enterprise';

        const isActiveTrial = organization.subscriptionTier === 'trial' && hasValidExpiry;

        return (isActiveTier && hasValidExpiry) || isActiveTrial;
      },

      isTrialActive: () => {
        const { organization } = get();
        if (!organization) return false;

        const expiresAt = organization.subscriptionExpiresAt;
        const hasValidExpiry = expiresAt !== null && new Date(expiresAt) > new Date();

        return organization.subscriptionTier === 'trial' && hasValidExpiry;
      },

      getDaysRemaining: () => {
        const { organization } = get();
        if (!organization) return null;

        const expiresAt = organization.subscriptionExpiresAt;
        if (!expiresAt) return null;

        const expiry = new Date(expiresAt);
        const now = new Date();

        if (expiry <= now) return 0;

        const diffTime = expiry.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return diffDays;
      },

      needsPayment: () => {
        const { organization } = get();
        if (!organization) return true;

        if (organization.subscriptionTier === 'inactive') return true;

        const expiresAt = organization.subscriptionExpiresAt;
        const hasValidExpiry = expiresAt !== null && new Date(expiresAt) > new Date();

        const isActive =
          (organization.subscriptionTier === 'premium' ||
            organization.subscriptionTier === 'enterprise' ||
            organization.subscriptionTier === 'trial') &&
          hasValidExpiry;

        return !isActive;
      },

      // Actions
      logout: () => {
        set({
          user: null,
          organization: null,
          examCenter: null,
          recentPayment: null,
          onboardingComplete: false,
          isInitialized: false,
        });
        if (typeof document !== 'undefined') {
          document.cookie = 'onboarding_complete=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          document.cookie = 'subscription_tier=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          document.cookie = 'subscription_expired=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        }
      },

      reset: () =>
        set({
          user: null,
          organization: null,
          examCenter: null,
          recentPayment: null,
          onboardingComplete: false,
          isInitialized: false,
        }),
    }),
    {
      name: 'testforge-storage',
      partialize: state => ({
        organization: state.organization,
        examCenter: state.examCenter,
        onboardingComplete: state.onboardingComplete,
        recentPayment: state.recentPayment,
      }),
    }
  )
);
