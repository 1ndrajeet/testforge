// app/billing/billing-client.tsx
'use client';

import { useEffect, useState } from 'react';

import Script from 'next/script';

import pricingPlans from '@/config/pricing.json';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Check,
  CreditCard,
  Crown,
  DollarSign,
  Gift,
  History,
  Infinity,
  Loader2,
  Lock,
  RefreshCw,
  Shield,
  Sparkles,
  Star,
  Timer,
  User,
  Zap,
} from 'lucide-react';

import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ============================================
// Types
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
  }
}

// ============================================
// Helper Functions
// ============================================

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
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

// ============================================
// Plan Icon Component
// ============================================

function PlanIcon({ planId, isPopular }: { planId: string; isPopular?: boolean }) {
  const getIcon = () => {
    if (planId === 'lifetime_access') return Infinity;
    if (planId === 'semester_online') return Zap;
    return Crown;
  };

  const Icon = getIcon();

  return (
    <div
      className={cn(
        'mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-colors',
        isPopular
          ? 'bg-emerald-500'
          : 'bg-neutral-100 group-hover:bg-emerald-50 dark:bg-neutral-800 dark:group-hover:bg-emerald-950/30',
      )}
    >
      <Icon
        className={cn(
          'h-6 w-6 transition-colors',
          isPopular ? 'text-white' : 'text-emerald-600 dark:text-emerald-400',
        )}
      />
    </div>
  );
}

// ============================================
// Feature List Component
// ============================================

function FeatureList({ features, className }: { features: string[]; className?: string }) {
  return (
    <ul className={cn('space-y-2.5', className)}>
      {features.map((feature) => (
        <li
          key={feature}
          className="flex items-start gap-3 text-sm"
        >
          <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
          <span className="text-neutral-600 dark:text-neutral-400">{feature}</span>
        </li>
      ))}
    </ul>
  );
}

// ============================================
// Pricing Card Component
// ============================================

function PricingCard({
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="relative h-full"
    >
      <div
        className={cn(
          'group flex h-full cursor-pointer flex-col rounded-2xl border bg-white p-6 transition-all duration-300 dark:bg-neutral-900',
          isSelected
            ? 'border-emerald-500 shadow-lg ring-2 ring-emerald-500'
            : isPopular
              ? 'border-emerald-200 shadow-md hover:shadow-lg dark:border-emerald-800'
              : 'border-neutral-200 hover:border-emerald-200 hover:shadow-md dark:border-neutral-800',
        )}
        onClick={() => onSelect(plan.id)}
      >
        {isPopular && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-xs font-medium text-white shadow-md">
              <Star className="h-3 w-3 fill-current" />
              Most Popular
            </span>
          </div>
        )}

        {plan.offer && (
          <div className="absolute top-3 right-0">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white shadow-md">
              <Gift className="h-3 w-3" />
              Limited Offer
            </span>
          </div>
        )}

        <PlanIcon
          planId={plan.id}
          isPopular={isPopular}
        />

        <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{plan.title}</h3>

        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-4xl font-bold text-neutral-900 dark:text-neutral-100">
            {plan.price}
          </span>
          <span className="text-sm text-neutral-500">/{plan.period}</span>
        </div>

        {plan.originalPrice && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-neutral-400 line-through">{plan.originalPrice}</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
              {plan.savings}
            </span>
          </div>
        )}

        {plan.highlight && (
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

        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">{plan.description}</p>

        <div className="mt-6 flex-1">
          <FeatureList features={plan.features} />
        </div>

        <Button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(plan.id);
          }}
          disabled={isLoading}
          variant={isSelected ? 'default' : 'outline'}
          className={cn(
            'mt-6 w-full transition-colors',
            isSelected
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30',
          )}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isSelected ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Selected
            </>
          ) : (
            plan.cta
          )}
        </Button>
      </div>
    </motion.div>
  );
}

// ============================================
// Current Plan Card Component
// ============================================

function CurrentPlanCard({
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
      <Card>
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

  const getPlanConfig = () => {
    switch (tier) {
      case 'enterprise':
        return {
          icon: Infinity,
          name: 'Lifetime Access',
          color: 'amber',
          bgGradient: 'from-amber-500/10 to-amber-600/5',
          iconBg: 'bg-amber-100 dark:bg-amber-950/30',
          iconColor: 'text-amber-600',
          badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
        };
      case 'premium':
        return {
          icon: Crown,
          name: 'Premium',
          color: 'emerald',
          bgGradient: 'from-emerald-500/10 to-emerald-600/5',
          iconBg: 'bg-emerald-100 dark:bg-emerald-950/30',
          iconColor: 'text-emerald-600',
          badgeColor:
            'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
        };
      case 'trial':
        return {
          icon: Zap,
          name: 'Trial Period',
          color: 'blue',
          bgGradient: 'from-blue-500/10 to-blue-600/5',
          iconBg: 'bg-blue-100 dark:bg-blue-950/30',
          iconColor: 'text-blue-600',
          badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
        };
      default:
        return {
          icon: AlertCircle,
          name: 'Inactive',
          color: 'neutral',
          bgGradient: 'from-neutral-500/10 to-neutral-600/5',
          iconBg: 'bg-neutral-100 dark:bg-neutral-800',
          iconColor: 'text-neutral-600',
          badgeColor: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400',
        };
    }
  };

  const planConfig = getPlanConfig();
  const Icon = planConfig.icon;
  const isActivePlan =
    tier === 'premium' || tier === 'enterprise' || (tier === 'trial' && !isExpired);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card className="overflow-hidden border-0 shadow-lg">
        <div className={cn('bg-gradient-to-r p-6', planConfig.bgGradient)}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-xl',
                  planConfig.iconBg,
                )}
              >
                <Icon className={cn('h-6 w-6', planConfig.iconColor)} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                  {subscription.planName}
                </h3>
                <p className="mt-0.5 text-sm text-neutral-500">
                  {organization?.name || 'Your Organization'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium',
                  isExpired
                    ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                    : tier === 'trial'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                      : tier === 'inactive'
                        ? 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
                )}
              >
                {isExpired
                  ? 'Expired'
                  : tier === 'trial'
                    ? 'Active Trial'
                    : tier === 'inactive'
                      ? 'No Active Plan'
                      : 'Active'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                className="h-8 w-8 p-0 text-neutral-500 hover:text-neutral-700"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <CardContent className="space-y-6 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {expiresAt && !isExpired && tier !== 'enterprise' && (
              <div className="flex items-center gap-3 rounded-lg bg-neutral-50 p-4 dark:bg-neutral-900/50">
                <Timer
                  className={cn(
                    'h-5 w-5',
                    daysRemaining <= 7 ? 'text-orange-500' : 'text-emerald-500',
                  )}
                />
                <div>
                  <p className="text-xs text-neutral-500">Time Remaining</p>
                  <p
                    className={cn(
                      'font-semibold',
                      daysRemaining <= 7
                        ? 'text-orange-600'
                        : 'text-neutral-900 dark:text-neutral-100',
                    )}
                  >
                    {daysRemaining} days left
                  </p>
                  <p className="text-xs text-neutral-400">Expires on {formatDate(expiresAt)}</p>
                </div>
              </div>
            )}

            {user && (
              <div className="flex items-center gap-3 rounded-lg bg-neutral-50 p-4 dark:bg-neutral-900/50">
                <User className="h-5 w-5 text-neutral-500" />
                <div>
                  <p className="text-xs text-neutral-500">Account Owner</p>
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {user.name}
                  </p>
                  <p className="text-xs text-neutral-400">{user.email}</p>
                </div>
              </div>
            )}

            {examCenter && (
              <div className="flex items-center gap-3 rounded-lg bg-neutral-50 p-4 dark:bg-neutral-900/50">
                <Building2 className="h-5 w-5 text-neutral-500" />
                <div>
                  <p className="text-xs text-neutral-500">Exam Center</p>
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {examCenter.name}
                  </p>
                  <p className="text-xs text-neutral-400">Code: {examCenter.code}</p>
                </div>
              </div>
            )}
          </div>

          {tier === 'enterprise' && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
              <Infinity className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Lifetime Access
                </p>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                  You have lifetime access to TestForge. No renewal needed.
                </p>
              </div>
            </div>
          )}

          {isExpired && tier !== 'enterprise' && (
            <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/20">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  Subscription Expired
                </p>
                <p className="mt-0.5 text-xs text-red-700 dark:text-red-400">
                  Please renew to continue using TestForge.
                </p>
              </div>
            </div>
          )}

          {tier === 'inactive' && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  No Active Subscription
                </p>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                  Please purchase a plan to continue using TestForge.
                </p>
              </div>
            </div>
          )}

          {tier === 'trial' && !isExpired && (
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  Trial Period Active
                </p>
                <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-400">
                  Upgrade to premium to continue after trial ends.
                </p>
              </div>
            </div>
          )}

          {tier === 'premium' && !isExpired && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
              <Crown className="h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  Premium Active
                </p>
                <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                  You have full access to all premium features.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Button
              onClick={onUpgrade}
              className={cn(
                'flex-1',
                !isActivePlan || isExpired
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700',
              )}
            >
              {tier === 'inactive'
                ? 'Purchase a Plan'
                : isExpired
                  ? 'Renew Subscription'
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
              <Shield className="h-3.5 w-3.5 text-neutral-400" />
              <span className="text-xs text-neutral-400">256-bit SSL</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ============================================
// Payment History Component
// ============================================

function PaymentHistory({
  payments,
  refreshTrigger,
}: {
  payments: Payment[];
  refreshTrigger: number;
}) {
  const [loading, setLoading] = useState(true);
  const [localPayments, setLocalPayments] = useState<Payment[]>(payments);

  useEffect(() => {
    const loadPayments = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/payments/history');
        const data = await response.json();
        setLocalPayments(data.payments || []);
      } catch (error) {
        console.error('Failed to load payments:', error);
      } finally {
        setLoading(false);
      }
    };
    loadPayments();
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="py-16 text-center"
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
          <History className="h-8 w-8 text-neutral-400" />
        </div>
        <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">
          No transactions yet
        </h3>
        <p className="mt-1 text-sm text-neutral-500">Your payment history will appear here</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      {paidPayments.map((payment, index) => (
        <motion.div
          key={payment.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
          className="flex flex-col items-start justify-between rounded-xl border border-neutral-200 bg-white p-4 transition-all hover:border-emerald-200 hover:shadow-md sm:flex-row sm:items-center dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="mb-3 flex items-center gap-4 sm:mb-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
              <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="font-medium text-neutral-900 dark:text-neutral-100">
                {payment.planName}
              </p>
              <p className="mt-0.5 text-xs text-neutral-400">{formatDate(payment.createdAt)}</p>
              {payment.endDate && (
                <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                  Valid until {formatDate(payment.endDate)}
                </p>
              )}
            </div>
          </div>
          <div className="w-full text-right sm:w-auto">
            <p className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
              {formatCurrency(payment.amount)}
            </p>
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Paid</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ============================================
// Pricing Plans Component
// ============================================

function PricingPlansSection({
  user,
  selectedPlanId,
  onSelectPlan,
  onPaymentSuccess,
}: {
  user: { name: string; email: string } | null;
  selectedPlanId: string;
  onSelectPlan: (id: string) => void;
  onPaymentSuccess: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  const handlePayment = async (plan: Plan) => {
    if (!user) {
      alert('Please login to continue');
      return;
    }

    setLoading(plan.id);

    try {
      const response = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          planId: plan.id,
          amount: plan.amount,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Order creation failed');
      }

      const { order } = await response.json();

      if (!window.Razorpay) {
        await new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve(true);
          document.body.appendChild(script);
        });
      }

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: 'TestForge',
        description: `${plan.title} Subscription`,
        order_id: order.id,
        handler: async (response: any) => {
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
            onPaymentSuccess();
          } else {
            alert('Payment verification failed. Please contact support.');
          }
          setLoading(null);
        },
        prefill: {
          name: user.name || '',
          email: user.email || '',
        },
        theme: { color: '#10b981' },
        modal: {
          ondismiss: () => setLoading(null),
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      console.error('Payment error:', error);
      alert(error instanceof Error ? error.message : 'Payment failed. Please try again.');
      setLoading(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {pricingPlans.map((plan: Plan) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            onSelect={onSelectPlan}
            isLoading={loading === plan.id}
            selectedId={selectedPlanId}
          />
        ))}
      </div>

      {selectedPlanId && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center"
        >
          <Button
            onClick={() => {
              const plan = pricingPlans.find((p: Plan) => p.id === selectedPlanId);
              if (plan) handlePayment(plan);
            }}
            disabled={loading !== null}
            className="h-12 min-w-[200px] bg-emerald-600 text-base text-white hover:bg-emerald-700"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Subscribe Now
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </motion.div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-6 pt-4">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-neutral-400" />
          <span className="text-xs text-neutral-500">Secure Payment</span>
        </div>
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-neutral-400" />
          <span className="text-xs text-neutral-500">SSL Encrypted</span>
        </div>
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-neutral-400" />
          <span className="text-xs text-neutral-500">Money-back Guarantee</span>
        </div>
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

  useEffect(() => {
    const popularPlan = pricingPlans.find((p: Plan) => p.popular);
    if (popularPlan) {
      setSelectedPlanId(popularPlan.id);
    } else if (pricingPlans[0]) {
      setSelectedPlanId(pricingPlans[0].id);
    }
  }, []);

  const handlePaymentSuccess = () => {
    setActiveTab('current');
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
      />

      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <div className="container mx-auto max-w-7xl px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                Billing & Subscription
              </h1>
            </div>
            <p className="text-neutral-500">
              Manage your plan, view payment history, and update billing information
            </p>
          </motion.div>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-8"
          >
            <TabsList className="grid w-full max-w-md grid-cols-3 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
              <TabsTrigger
                value="current"
                className="rounded-lg text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-neutral-900"
              >
                Current Plan
              </TabsTrigger>
              <TabsTrigger
                value="plans"
                className="rounded-lg text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-neutral-900"
              >
                Plans
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="rounded-lg text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-neutral-900"
              >
                History
              </TabsTrigger>
            </TabsList>

            <AnimatePresence mode="wait">
              <TabsContent
                value="current"
                className="mt-0"
                key={`current-${refreshTrigger}`}
              >
                <CurrentPlanCard
                  subscription={subscription}
                  organization={organization}
                  examCenter={examCenter}
                  user={user}
                  onUpgrade={() => setActiveTab('plans')}
                  onRefresh={() => setRefreshTrigger((prev) => prev + 1)}
                />
              </TabsContent>

              <TabsContent
                value="plans"
                className="mt-0"
              >
                <PricingPlansSection
                  user={user}
                  selectedPlanId={selectedPlanId}
                  onSelectPlan={setSelectedPlanId}
                  onPaymentSuccess={handlePaymentSuccess}
                />
              </TabsContent>

              <TabsContent
                value="history"
                className="mt-0"
                key={`history-${refreshTrigger}`}
              >
                <PaymentHistory
                  payments={payments}
                  refreshTrigger={refreshTrigger}
                />
              </TabsContent>
            </AnimatePresence>
          </Tabs>
        </div>
      </div>
    </>
  );
}
