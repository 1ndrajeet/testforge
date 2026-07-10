'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import pricingPlans from '@/config/pricing.json';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Calendar,
  Check,
  CreditCard,
  Crown,
  FileText,
  Infinity,
  Landmark,
  Loader2,
  Lock,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  User,
  Zap,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { logger } from '@/lib/misc/logger';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ============================================
// Types (unchanged data contract)
// ============================================

interface Payment {
  id: string;
  planName: string;
  amount: number;
  status: string;
  createdAt: Date;
  endDate: Date | null;
}

interface Plan {
  id: string;
  title: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  popular?: boolean;
  offer?: boolean;
  originalPrice?: string;
  savings?: string;
  highlight?: string;
  highlightDetail?: string;
  cta: string;
  disabled?: boolean;
  launchOffer?: string;
  launchPrice?: string;
  launchAmount?: number;
  amount: number;
}

interface SubscriptionInfo {
  tier: string;
  planName: string;
  expiresAt: string | null;
  isActive: boolean;
}

interface BillingClientProps {
  user: { id: string; name: string; email: string } | null;
  examCenter: { id: string; name: string; code: string } | null;
  subscription: SubscriptionInfo | null;
  organization: { id: string; name: string } | null;
  initialPayments: Payment[];
}

declare global {
  interface Window {
    Razorpay: any;
    __RAZORPAY_INSTANCE__?: any;
    __RAZORPAY_LOADED__?: boolean;
    __RAZORPAY_LOADING__?: boolean;
  }
}

// ============================================
// Razorpay Singleton — GLOBAL INSTANCE
// (business logic untouched)
// ============================================

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

class RazorpayLoader {
  private static instance: RazorpayLoader;
  private loadPromise: Promise<void> | null = null;
  private isLoaded = false;

  private constructor() {
    if (typeof window !== 'undefined') {
      if (window.Razorpay) {
        this.isLoaded = true;
        window.__RAZORPAY_LOADED__ = true;
      }
    }
  }

  static getInstance(): RazorpayLoader {
    if (!RazorpayLoader.instance) {
      RazorpayLoader.instance = new RazorpayLoader();
    }
    return RazorpayLoader.instance;
  }

  async ensureLoaded(): Promise<void> {
    if (typeof window === 'undefined') return;

    if (this.isLoaded && window.Razorpay) {
      return Promise.resolve();
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this.loadScript();

    try {
      await this.loadPromise;
      this.isLoaded = true;
      window.__RAZORPAY_LOADED__ = true;
    } catch (error) {
      this.loadPromise = null;
      throw error;
    }

    return this.loadPromise;
  }

  private loadScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) {
        this.isLoaded = true;
        resolve();
        return;
      }

      const existingScript = document.querySelector(
        `script[src="${RAZORPAY_SCRIPT_URL}"]`
      );

      if (existingScript) {
        const onLoad = () => {
          if (window.Razorpay) {
            this.isLoaded = true;
            resolve();
          } else {
            reject(new Error('Razorpay not available'));
          }
        };

        existingScript.addEventListener('load', onLoad, { once: true });
        existingScript.addEventListener('error', () => reject(new Error('Failed to load Razorpay')), { once: true });

        setTimeout(() => {
          if (!this.isLoaded) {
            if (window.Razorpay) {
              this.isLoaded = true;
              resolve();
            } else {
              reject(new Error('Razorpay load timeout'));
            }
          }
        }, 15000);

        return;
      }

      const script = document.createElement('script');
      script.src = RAZORPAY_SCRIPT_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';

      script.onload = () => {
        if (window.Razorpay) {
          this.isLoaded = true;
          resolve();
        } else {
          reject(new Error('Razorpay loaded but not available'));
        }
      };

      script.onerror = () => {
        reject(new Error('Failed to load Razorpay SDK'));
      };

      document.head.appendChild(script);
    });
  }

  isReady(): boolean {
    return this.isLoaded && typeof window !== 'undefined' && !!window.Razorpay;
  }
}

// ============================================
// Payment Manager — SINGLETON with request dedup
// (business logic untouched)
// ============================================

class PaymentManager {
  private static instance: PaymentManager;
  private isProcessing = false;
  private pendingRequest: Promise<void> | null = null;
  private razorpayLoader: RazorpayLoader;

  private constructor() {
    this.razorpayLoader = RazorpayLoader.getInstance();
  }

  static getInstance(): PaymentManager {
    if (!PaymentManager.instance) {
      PaymentManager.instance = new PaymentManager();
    }
    return PaymentManager.instance;
  }

  async processPayment(
    plan: Plan,
    user: { name: string; email: string },
    onSuccess: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    if (this.isProcessing && this.pendingRequest) {
      logger.warn('payment', 'Payment already in progress, returning existing promise');
      return this.pendingRequest;
    }

    this.isProcessing = true;
    this.pendingRequest = this.executePayment(plan, user, onSuccess, onError);

    try {
      await this.pendingRequest;
    } finally {
      this.isProcessing = false;
      this.pendingRequest = null;
    }
  }

  private async executePayment(
    plan: Plan,
    user: { name: string; email: string },
    onSuccess: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    try {
      await this.razorpayLoader.ensureLoaded();

      if (!this.razorpayLoader.isReady()) {
        throw new Error('Payment gateway is not ready');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          planId: plan.id,
          amount: plan.amount,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Order creation failed');
      }

      const { order } = await response.json();

      if (!window.Razorpay) {
        throw new Error('Razorpay SDK not available');
      }

      return new Promise((resolve, reject) => {
        let isResolved = false;

        const options = {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: order.amount,
          currency: order.currency,
          name: 'TestForge',
          description: `${plan.title} Subscription`,
          order_id: order.id,
          handler: async (response: any) => {
            if (isResolved) return;
            isResolved = true;

            try {
              const verifyResponse = await fetch('/api/payments/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'verify',
                  planId: plan.id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });

              if (verifyResponse.ok) {
                onSuccess();
                resolve();
              } else {
                const error = await verifyResponse.json();
                reject(new Error(error.error || 'Payment verification failed'));
              }
            } catch (error) {
              reject(error);
            }
          },
          modal: {
            ondismiss: () => {
              if (isResolved) return;
              isResolved = true;
              reject(new Error('Payment cancelled'));
            },
          },
          prefill: {
            name: user.name || '',
            email: user.email || '',
          },
          theme: { color: '#1E3A5F' },
        };

        try {
          const razorpay = new window.Razorpay(options);
          razorpay.open();
        } catch (error) {
          if (!isResolved) {
            isResolved = true;
            reject(error);
          }
        }
      });
    } catch (error) {
      if (onError) {
        onError(error as Error);
      }
      throw error;
    }
  }

  reset(): void {
    this.isProcessing = false;
    this.pendingRequest = null;
  }
}

// ============================================
// Helpers
// ============================================

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateShort(date: Date | string) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

/** Derives an "examination cycle" label from the current date, since the
 * data model does not track a discrete cycle entity. Purely presentational. */
function getCurrentCycleLabel() {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const season = month >= 3 && month <= 8 ? 'Summer' : 'Winter';
  return `${season} ${now.getFullYear()}`;
}

// ============================================
// Shared visual atoms
// ============================================

function CodeChip({ children, tone = 'navy' }: { children: React.ReactNode; tone?: 'navy' | 'gold' | 'emerald' }) {
  const toneClasses = {
    navy: 'bg-emerald-500/[0.06] text-emerald-500 border-emerald-500/15 dark:bg-white/5 dark:text-slate-200 dark:border-white/10',
    gold: 'bg-navy-500/10 text-navy-500 border-navy-500 dark:text-navy-400',
    emerald: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400',
  }[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] font-medium tracking-wide',
        toneClasses,
      )}
    >
      {children}
    </span>
  );
}

function SealBadge({ label, icon: Icon }: { label: string; icon: React.ElementType }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/20 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

// ============================================
// Examination Financial Header
// ============================================

function ExamFinancialHeader({
  examCenter,
  organization,
  onProcessPayment,
  onViewLedger,
}: {
  examCenter: { id: string; name: string; code: string } | null;
  organization: { id: string; name: string } | null;
  onProcessPayment: () => void;
  onViewLedger: () => void;
}) {
  const cycle = getCurrentCycleLabel();

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-emerald-500/10 bg-gradient-to-br from-emerald-500 via-emerald-500 to-emerald-600 p-6 text-white shadow-lg sm:p-8"
    >
      {/* subtle seal watermark */}
      <Landmark className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 text-white/[0.05]" />

      <div className="relative flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
              <Landmark className="h-5.5 w-5.5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                Examination Financial Operations
              </p>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight sm:text-[1.7rem]">
                {examCenter?.name || organization?.name || 'Your Exam Center'}
              </h1>
            </div>
          </div>

          <SealBadge label="Verified Examination Center" icon={ShieldCheck} />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {examCenter?.code && (
            <CodeChip tone="gold">
              <span className="opacity-70">CENTER</span> {examCenter.code}
            </CodeChip>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-medium tracking-wide text-white/90">
            <Calendar className="h-3 w-3" />
            {cycle} Cycle
          </span>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-white/10 pt-5">
          <Button
            onClick={onProcessPayment}
            className="bg-white text-emerald-500 hover:bg-white/90"
          >
            <CreditCard className="mr-2 h-4 w-4" />
            Process Payment
          </Button>
          <Button
            onClick={onViewLedger}
            variant="outline"
            className="border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white"
          >
            <ScrollText className="mr-2 h-4 w-4" />
            View Transaction Ledger
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// Access Status Cards (Current plan, reframed)
// ============================================

function AccessStatusCards({
  subscription,
  organization,
  examCenter,
  user,
  onUpgrade,
  onRefresh,
}: {
  subscription: SubscriptionInfo | null;
  organization: { name: string } | null;
  examCenter: { name: string; code: string } | null;
  user: { name: string; email: string } | null;
  onUpgrade: () => void;
  onRefresh: () => void;
}) {
  const handleSignOut = async () => {
    const { authClient } = await import('@/lib/auth-client');
    await authClient.signOut();
    window.location.href = '/login';
  };

  if (!subscription) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </CardContent>
      </Card>
    );
  }

  const tier = subscription.tier;
  const expiresAt = subscription.expiresAt;
  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
  const daysRemaining =
    expiresAt && !isExpired
      ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0;

  const tierConfig: Record<
    string,
    { icon: React.ElementType; label: string; accent: string; bg: string; ring: string }
  > = {
    enterprise: {
      icon: Infinity,
      label: 'Lifetime Access',
      accent: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/20',
      ring: 'ring-amber-500/20',
    },
    premium: {
      icon: Crown,
      label: 'Premium Access',
      accent: 'text-emerald-500 dark:text-slate-200',
      bg: 'bg-emerald-500/[0.05] dark:bg-white/5',
      ring: 'ring-emerald-500/15',
    },
    trial: {
      icon: Zap,
      label: 'Trial Access',
      accent: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/20',
      ring: 'ring-blue-500/20',
    },
    inactive: {
      icon: FileText,
      label: 'No Active Access',
      accent: 'text-neutral-600 dark:text-neutral-400',
      bg: 'bg-neutral-50 dark:bg-neutral-900',
      ring: 'ring-neutral-500/15',
    },
  };
  const config = tierConfig[tier] || tierConfig.inactive;
  const Icon = config.icon;
  const isActivePlan = tier === 'premium' || tier === 'enterprise' || (tier === 'trial' && !isExpired);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {/* Access Cycle Card */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={cn('h-full border-0 shadow-sm ring-1', config.ring)}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Access Cycle
                </p>
                <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', config.bg)}>
                  <Icon className={cn('h-4.5 w-4.5', config.accent)} />
                </div>
              </div>
              <p className="mt-3 text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {subscription.planName}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                    isExpired
                      ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
                  )}
                >
                  {isExpired ? 'Expired' : tier === 'inactive' ? 'Inactive' : 'Active'}
                </span>
                {expiresAt && !isExpired && tier !== 'enterprise' && (
                  <span className="font-mono text-[11px] text-neutral-500">
                    till {formatDateShort(expiresAt)}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Time Remaining Card */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="h-full border-0 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-800">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Days Remaining
                </p>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                  <Timer className={cn('h-4.5 w-4.5', daysRemaining <= 7 && daysRemaining > 0 ? 'text-orange-500' : 'text-neutral-500')} />
                </div>
              </div>
              <p className="mt-3 font-mono text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                {tier === 'enterprise' ? '∞' : isExpired ? '0' : daysRemaining}
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                {tier === 'enterprise'
                  ? 'Lifetime access — no renewal needed'
                  : isExpired
                    ? 'Renewal required to continue'
                    : 'in current access cycle'}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Center Info Card */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="h-full border-0 shadow-sm ring-1 ring-neutral-200 dark:ring-neutral-800">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Center Information
                </p>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                  <Building2 className="h-4.5 w-4.5 text-neutral-500" />
                </div>
              </div>
              <p className="mt-3 truncate text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {examCenter?.name || organization?.name || 'Not configured'}
              </p>
              {examCenter?.code && (
                <div className="mt-2">
                  <CodeChip>{examCenter.code}</CodeChip>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Detail panel */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="overflow-hidden border-0 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 bg-neutral-50/60 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-900/40">
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
              <FileText className="h-4 w-4 text-neutral-400" />
              Access Cycle Detail
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              className="h-8 gap-1.5 px-2 text-xs text-neutral-500 hover:text-neutral-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>

          <CardContent className="space-y-5 p-6">
            {user && (
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 shrink-0 text-neutral-400" />
                <div className="text-sm">
                  <span className="text-neutral-500">Account owner — </span>
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">{user.name}</span>
                  <span className="text-neutral-400"> ({user.email})</span>
                </div>
              </div>
            )}

            {tier === 'enterprise' && (
              <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
                <Infinity className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Lifetime Access Granted</p>
                  <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                    This center has permanent access across all future examination cycles. No renewal required.
                  </p>
                </div>
              </div>
            )}

            {isExpired && tier !== 'enterprise' && (
              <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/20">
                <Timer className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-300">Access Cycle Expired</p>
                  <p className="mt-0.5 text-xs text-red-700 dark:text-red-400">
                    Renew to continue processing examination operations for this center.
                  </p>
                </div>
              </div>
            )}

            {tier === 'inactive' && (
              <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
                <FileText className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">No Active Access Cycle</p>
                  <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                    Select a cycle plan below to activate examination operations for this center.
                  </p>
                </div>
              </div>
            )}

            {tier === 'trial' && !isExpired && (
              <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
                <Zap className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Trial Cycle Active</p>
                  <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-400">
                    Upgrade before the trial ends to avoid disruption to examination operations.
                  </p>
                </div>
              </div>
            )}

            {tier === 'premium' && !isExpired && (
              <div className="flex items-center gap-3 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-4 dark:border-white/10 dark:bg-white/5">
                <Crown className="h-5 w-5 flex-shrink-0 text-emerald-500 dark:text-slate-300" />
                <div>
                  <p className="text-sm font-medium text-emerald-500 dark:text-slate-200">Premium Access Active</p>
                  <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                    Full examination operations access for this center.
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 pt-1 sm:flex-row">
              <Button
                onClick={onUpgrade}
                className={cn(
                  'flex-1',
                  !isActivePlan || isExpired
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700',
                )}
              >
                {tier === 'inactive'
                  ? 'Activate a Cycle Plan'
                  : isExpired
                    ? 'Renew Access'
                    : 'Upgrade / Change Plan'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                onClick={handleSignOut}
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20"
              >
                Sign Out
              </Button>
            </div>

            <div className="flex items-center justify-center gap-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <div className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-xs text-neutral-400">Secured by Razorpay</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-xs text-neutral-400">256-bit SSL</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// ============================================
// Cycle Plan Card (pricing card, reframed)
// ============================================

function CyclePlanCard({
  plan,
  onSelect,
  isLoading,
  selectedId,
}: {
  plan: Plan;
  onSelect: (id: string) => void;
  isLoading: boolean;
  selectedId: string;
}) {
  const isSelected = selectedId === plan.id;
  const isPopular = plan.popular;
  const isDisabled = plan.disabled || false;

  const getIcon = () => {
    if (plan.id === 'lifetime_access') return Infinity;
    if (plan.id === 'semester_online') return Zap;
    return Crown;
  };
  const Icon = getIcon();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="relative h-full"
    >
      <div
        className={cn(
          'group flex h-full flex-col rounded-2xl border bg-white p-6 transition-all duration-300 dark:bg-neutral-900',
          isDisabled
            ? 'cursor-not-allowed border-neutral-200 opacity-60 dark:border-neutral-800'
            : 'cursor-pointer',
          isSelected && !isDisabled
            ? 'border-emerald-500 shadow-lg ring-2 ring-emerald-500/60'
            : isPopular && !isDisabled
              ? 'border-amber-300/70 shadow-md hover:shadow-lg dark:border-amber-800'
              : 'border-neutral-200 hover:border-emerald-500/30 hover:shadow-md dark:border-neutral-800',
        )}
        onClick={() => !isDisabled && onSelect(plan.id)}
      >
        {/* Popular Badge */}
        {isPopular && !isDisabled && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white shadow-md">
              <Star className="h-3 w-3 fill-current" />
              Recommended
            </span>
          </div>
        )}

        {/* Disabled Badge */}
        {isDisabled && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="inline-flex items-center gap-1 rounded-full bg-neutral-500 px-3 py-1 text-xs font-medium text-white shadow-md">
              <Lock className="h-3 w-3" />
              Coming Soon
            </span>
          </div>
        )}

        {/* Header: Icon + Offer Badge */}
        <div className="flex items-start justify-between">
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-xl transition-colors',
              isPopular && !isDisabled
                ? 'bg-amber-500'
                : 'bg-emerald-500/[0.06] group-hover:bg-emerald-500/10 dark:bg-white/5',
              isDisabled && 'bg-neutral-100 dark:bg-neutral-800',
            )}
          >
            <Icon
              className={cn(
                'h-6 w-6',
                isPopular && !isDisabled
                  ? 'text-white'
                  : isDisabled
                    ? 'text-neutral-400 dark:text-neutral-600'
                    : 'text-emerald-500 dark:text-slate-300',
              )}
            />
          </div>

          {plan.offer && !isDisabled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-medium text-white shadow-md">
              <Sparkles className="h-3 w-3" />
              Limited Offer
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="mt-4 text-xl font-bold text-neutral-900 dark:text-neutral-100">
          {plan.title}
        </h3>

        {/* Pricing */}
        <div className="mt-3 flex items-baseline gap-1">
          <span className="font-mono text-4xl font-bold text-neutral-900 dark:text-neutral-100">
            {plan.price}
          </span>
          <span className="text-sm font-sans text-neutral-500">/{plan.period}</span>
        </div>

        {/* Original Price (if any) */}
        {plan.originalPrice && (
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-sm text-neutral-400 line-through">
              {plan.originalPrice}
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
              {plan.savings}
            </span>
          </div>
        )}

        {/* Highlight (if any) */}
        {plan.highlight && !isDisabled && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
              {plan.highlight}
            </p>
            {plan.highlightDetail && (
              <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-500">
                {plan.highlightDetail}
              </p>
            )}
          </div>
        )}

        {/* Description */}
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
          {plan.description}
        </p>

        {/* Features */}
        <div className="mt-6 flex-1">
          <ul className="space-y-2.5">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm">
                <Check
                  className={cn(
                    'mt-0.5 h-4 w-4 flex-shrink-0',
                    isDisabled
                      ? 'text-neutral-400 dark:text-neutral-600'
                      : 'text-emerald-500 dark:text-emerald-400',
                  )}
                />
                <span
                  className={cn(
                    isDisabled
                      ? 'text-neutral-400 dark:text-neutral-500'
                      : 'text-neutral-600 dark:text-neutral-400',
                  )}
                >
                  {feature}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA Button */}
        <Button
          onClick={(e) => {
            e.stopPropagation();
            if (!isDisabled) onSelect(plan.id);
          }}
          disabled={isLoading || isDisabled}
          variant={isSelected && !isDisabled ? 'default' : 'outline'}
          className={cn(
            'mt-6 w-full transition-colors',
            isSelected && !isDisabled
              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
              : isDisabled
                ? 'cursor-not-allowed border-neutral-200 text-neutral-400 dark:border-neutral-700 dark:text-neutral-500'
                : 'border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/[0.05] dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5',
          )}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isSelected && !isDisabled ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Selected
            </>
          ) : isDisabled ? (
            'Unavailable'
          ) : (
            plan.cta
          )}
        </Button>
      </div>
    </motion.div>
  );
}

// ============================================
// Cycle Plans Section (pricing plans, reframed)
// ============================================

function CyclePlansSection({
  user,
  examCenter,
  selectedPlanId,
  onSelectPlan,
  onPaymentSuccess,
}: {
  user: { name: string; email: string } | null;
  examCenter: { name: string; code: string } | null;
  selectedPlanId: string;
  onSelectPlan: (id: string) => void;
  onPaymentSuccess: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [isRazorpayReady, setIsRazorpayReady] = useState(false);
  const paymentManager = useRef(PaymentManager.getInstance());
  const isMounted = useRef(true);
  const hasPreloaded = useRef(false);

  // Preload Razorpay
  useEffect(() => {
    isMounted.current = true;

    const preloadRazorpay = async () => {
      if (hasPreloaded.current) return;
      hasPreloaded.current = true;

      try {
        const loader = RazorpayLoader.getInstance();
        await loader.ensureLoaded();
        if (isMounted.current) {
          setIsRazorpayReady(true);
          logger.info('billing_client', 'Razorpay loaded');
        }
      } catch (error) {
        logger.error('billing_client', 'Failed to load Razorpay:', error);
        if (isMounted.current) {
          setTimeout(() => {
            if (isMounted.current) {
              hasPreloaded.current = false;
              preloadRazorpay();
            }
          }, 5000);
        }
      }
    };

    preloadRazorpay();

    return () => {
      isMounted.current = false;
      paymentManager.current.reset();
    };
  }, []);

  const handlePayment = useCallback(
    async (plan: Plan) => {
      if (!user) {
        alert('Please login to continue');
        return;
      }

      if (loading || plan.disabled) {
        return;
      }

      setLoading(plan.id);

      try {
        await paymentManager.current.processPayment(
          plan,
          user,
          () => {
            onPaymentSuccess();
            setLoading(null);
          },
          (error) => {
            console.error('Payment error:', error);
            alert(error.message || 'Payment failed. Please try again.');
            setLoading(null);
          },
        );
      } catch (error) {
        console.error('Payment error:', error);
        if (!(error instanceof Error && error.message === 'Payment cancelled')) {
          alert(error instanceof Error ? error.message : 'Payment failed. Please try again.');
        }
        setLoading(null);
      }
    },
    [user, loading, onPaymentSuccess],
  );

  // Filter out disabled plans or keep them with disabled state
  const activePlans = pricingPlans.filter((p: Plan) => !p.disabled);
  const disabledPlans = pricingPlans.filter((p: Plan) => p.disabled);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
          Examination Cycle Access Plans
        </h2>
        <p className="text-sm text-neutral-500">
          {examCenter?.name
            ? `Select the access plan for ${examCenter.name}${examCenter.code ? ` (${examCenter.code})` : ''}.`
            : 'Select the access plan for your examination center.'}
        </p>
      </div>

      {/* Razorpay Loading */}
      {!isRazorpayReady && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading payment gateway...
        </div>
      )}

      {/* Active Plans Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {activePlans.map((plan: Plan) => (
          <CyclePlanCard
            key={plan.id}
            plan={plan}
            onSelect={onSelectPlan}
            isLoading={loading === plan.id}
            selectedId={selectedPlanId}
          />
        ))}
      </div>

      {/* Disabled Plans Grid (greyed out) */}
      {disabledPlans.length > 0 && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-200 dark:border-neutral-800" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-neutral-400 dark:bg-neutral-900">
                Coming Soon
              </span>
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {disabledPlans.map((plan: Plan) => (
              <CyclePlanCard
                key={plan.id}
                plan={plan}
                onSelect={onSelectPlan}
                isLoading={loading === plan.id}
                selectedId={selectedPlanId}
              />
            ))}
          </div>
        </>
      )}

      {/* Payment Button */}
      {selectedPlanId && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center"
        >
          <Button
            onClick={() => {
              const plan = pricingPlans.find((p: Plan) => p.id === selectedPlanId);
              if (plan && !plan.disabled) handlePayment(plan);
            }}
            disabled={
              loading !== null ||
              !isRazorpayReady ||
              !!pricingPlans.find((p: Plan) => p.id === selectedPlanId)?.disabled
            }
            className="h-12 min-w-[220px] bg-emerald-500 text-base text-white hover:bg-[#16293f]"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Confirm & Process Payment
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </motion.div>
      )}

      {/* Trust Signals */}
      <div className="flex flex-wrap items-center justify-center gap-6 pt-4">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-neutral-400" />
          <span className="text-xs text-neutral-500">Secure Payment</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-neutral-400" />
          <span className="text-xs text-neutral-500">SSL Encrypted</span>
        </div>
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-neutral-400" />
          <span className="text-xs text-neutral-500">Issued for Institutional Billing</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Transaction Ledger (payment history, reframed)
// ============================================

function TransactionLedger({ payments, refreshTrigger }: { payments: Payment[]; refreshTrigger: number }) {
  const [loading, setLoading] = useState(true);
  const [localPayments, setLocalPayments] = useState<Payment[]>(payments);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const loadPayments = async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      setLoading(true);

      try {
        const response = await fetch('/api/payments/history', {
          signal: abortControllerRef.current.signal,
        });
        const data = await response.json();
        setLocalPayments(data.payments || []);
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          logger.error('billing_client', 'Failed to load payments:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    loadPayments();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  const paidPayments = localPayments.filter((p) => p.status === 'paid');

  if (paidPayments.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
          <ScrollText className="h-8 w-8 text-neutral-400" />
        </div>
        <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">No transactions on record</h3>
        <p className="mt-1 text-sm text-neutral-500">Completed examination cycle payments will appear here</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">Transaction Ledger</h2>
        <span className="font-mono text-xs text-neutral-400">{paidPayments.length} record(s)</span>
      </div>

      <div className="space-y-3">
        {paidPayments.map((payment, index) => (
          <motion.div
            key={payment.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex flex-col items-start justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4 transition-all hover:border-emerald-500/25 hover:shadow-md sm:flex-row sm:items-center dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/[0.06] dark:bg-white/5">
                <CreditCard className="h-5 w-5 text-emerald-500 dark:text-slate-300" />
              </div>
              <div>
                <p className="font-medium text-neutral-900 dark:text-neutral-100">{payment.planName}</p>
                <p className="mt-0.5 font-mono text-xs text-neutral-400">{formatDate(payment.createdAt)}</p>
                {payment.endDate && (
                  <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                    Cycle valid until {formatDate(payment.endDate)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
              <p className="font-mono text-xl font-bold text-neutral-900 dark:text-neutral-100">
                {formatCurrency(payment.amount)}
              </p>
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-600/20 bg-emerald-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
                <Check className="h-3 w-3" />
                Paid
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Main Billing Client Component
// ============================================

export function BillingClient({
  user,
  examCenter,
  subscription,
  organization,
  initialPayments,
}: BillingClientProps) {
  const [activeTab, setActiveTab] = useState('current');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [payments] = useState<Payment[]>(initialPayments);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const popularPlan = pricingPlans.find((p: Plan) => p.popular);
    setSelectedPlanId(popularPlan?.id || pricingPlans[0]?.id || '');
  }, []);

  const handlePaymentSuccess = useCallback(() => {
    setActiveTab('current');
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  return (
    <div className="min-h-screen ">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <ExamFinancialHeader
          examCenter={examCenter}
          organization={organization}
          onProcessPayment={() => setActiveTab('plans')}
          onViewLedger={() => setActiveTab('history')}
        />

        <div className="mt-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
            <TabsList className="grid w-full max-w-lg grid-cols-3 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
              <TabsTrigger
                value="current"
                className="rounded-lg text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-neutral-900"
              >
                Access Status
              </TabsTrigger>
              <TabsTrigger
                value="plans"
                className="rounded-lg text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-neutral-900"
              >
                Cycle Plans
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="rounded-lg text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-neutral-900"
              >
                Ledger
              </TabsTrigger>
            </TabsList>

            <AnimatePresence mode="wait">
              <TabsContent value="current" className="mt-0" key={`current-${refreshTrigger}`}>
                <AccessStatusCards
                  subscription={subscription}
                  organization={organization}
                  examCenter={examCenter}
                  user={user}
                  onUpgrade={() => setActiveTab('plans')}
                  onRefresh={() => setRefreshTrigger((prev) => prev + 1)}
                />
              </TabsContent>

              <TabsContent value="plans" className="mt-0">
                <CyclePlansSection
                  user={user}
                  examCenter={examCenter}
                  selectedPlanId={selectedPlanId}
                  onSelectPlan={setSelectedPlanId}
                  onPaymentSuccess={handlePaymentSuccess}
                />
              </TabsContent>

              <TabsContent value="history" className="mt-0" key={`history-${refreshTrigger}`}>
                <TransactionLedger payments={payments} refreshTrigger={refreshTrigger} />
              </TabsContent>
            </AnimatePresence>
          </Tabs>
        </div>
      </div>
    </div>
  );
}