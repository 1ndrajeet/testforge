// app/billing/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';
import Script from 'next/script';

import { getCurrentSubscription, getPaymentHistory } from '@/app/actions/onboarding';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Infinity,
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CreditCard,
  Crown,
  DollarSign,
  Gift,
  History,
  Loader2,
  Lock,
  RefreshCw,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Timer,
  User,
  Zap,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useUser } from '@/hooks/useUser';

import { cn } from '@/lib/utils';

import pricingPlans from '@/config/pricing.json';

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
  planName?: string;
  expiresAt: string | null;
  isActive: boolean;
}

interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
}

interface ExamCenterInfo {
  id: string;
  name: string;
  code: string;
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
        'h-12 w-12 rounded-xl flex items-center justify-center mb-4 transition-all',
        isPopular
          ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/25'
          : 'bg-neutral-100 dark:bg-neutral-800 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30'
      )}
    >
      <Icon
        className={cn(
          'h-6 w-6 transition-all',
          isPopular ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'
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
    <ul className={cn('space-y-2', className)}>
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-2 text-sm">
          <Check className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
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
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="relative"
    >
      <div
        className={cn(
          'rounded-2xl transition-all duration-300 cursor-pointer h-full',
          isSelected
            ? 'ring-2 ring-emerald-500 shadow-xl shadow-emerald-500/20'
            : 'hover:shadow-lg',
          isPopular && !isSelected && 'ring-1 ring-emerald-200 dark:ring-emerald-800'
        )}
        onClick={() => onSelect(plan.id)}
      >
        <div
          className={cn(
            'rounded-2xl p-6 h-full flex flex-col',
            isSelected
              ? 'bg-gradient-to-br from-white to-emerald-50/50 dark:from-neutral-900 dark:to-emerald-950/20'
              : 'bg-white dark:bg-neutral-900'
          )}
        >
          {isPopular && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs font-medium shadow-lg">
                <Star className="h-3 w-3 fill-current" />
                Most Popular
              </span>
            </div>
          )}

          {plan.offer && (
            <div className="absolute -top-3 right-4">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-medium shadow-lg">
                <Gift className="h-3 w-3" />
                Limited Offer
              </span>
            </div>
          )}

          <PlanIcon planId={plan.id} isPopular={isPopular} />

          <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{plan.title}</h3>

          <div className="mt-4 mb-2">
            <span className="text-4xl font-bold text-neutral-900 dark:text-neutral-100">
              {plan.price}
            </span>
            <span className="text-sm text-neutral-500">/{plan.period}</span>
          </div>

          {plan.originalPrice && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-neutral-400 line-through">{plan.originalPrice}</span>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full">
                {plan.savings}
              </span>
            </div>
          )}

          {plan.highlight && (
            <div className="mb-4 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {plan.highlight}
              </p>
              {plan.highlightDetail && (
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                  {plan.highlightDetail}
                </p>
              )}
            </div>
          )}

          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">{plan.description}</p>

          <FeatureList features={plan.features} className="mb-6 flex-1" />

          <Button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(plan.id);
            }}
            disabled={isLoading}
            className={cn(
              'w-full transition-all',
              isSelected
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/25'
                : 'bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : isSelected ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Selected
              </>
            ) : (
              plan.cta
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// Current Plan Card Component (Server Action based)
// ============================================

function CurrentPlanCard({
  onUpgrade,
  refreshTrigger,
}: {
  onUpgrade: () => void;
  refreshTrigger: number;
}) {
  const { signOut, user } = useUser();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [organization, setOrganization] = useState<OrganizationInfo | null>(null);
  const [examCenter, setExamCenter] = useState<ExamCenterInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const subData = await getCurrentSubscription();
      setSubscription({
        tier: subData.tier,
        planName: subData.planName, // Add this line
        expiresAt: subData.expiresAt ? new Date(subData.expiresAt).toISOString() : null,
        isActive: subData.isActive!,
      });

      // Fetch organization and exam center info
      const statusRes = await fetch('/api/user/status');
      const statusData = await statusRes.json();
      if (statusData.organization) {
        setOrganization(statusData.organization);
      }
      if (statusData.examCenter) {
        setExamCenter(statusData.examCenter);
      }
    } catch (error) {
      console.error('Failed to fetch subscription:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const tier = subscription?.tier || 'inactive';
  const expiresAt = subscription?.expiresAt || null;
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
          bgGradient: 'from-amber-500 to-amber-600',
        };
      case 'premium':
        return {
          icon: Crown,
          name: 'Premium',
          color: 'emerald',
          bgGradient: 'from-emerald-500 to-emerald-600',
        };
      case 'trial':
        return {
          icon: Zap,
          name: 'Trial Period',
          color: 'blue',
          bgGradient: 'from-blue-500 to-blue-600',
        };
      default:
        return {
          icon: AlertCircle,
          name: 'Inactive',
          color: 'neutral',
          bgGradient: 'from-neutral-500 to-neutral-600',
        };
    }
  };

  const planConfig = getPlanConfig();
  const Icon = planConfig.icon;
  const isActivePlan =
    tier === 'premium' || tier === 'enterprise' || (tier === 'trial' && !isExpired);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="overflow-hidden">
        <div
          className={cn(
            'bg-gradient-to-r p-6',
            tier === 'enterprise'
              ? 'from-amber-500/10 to-amber-600/5'
              : tier === 'premium'
                ? 'from-emerald-500/10 to-emerald-600/5'
                : tier === 'trial'
                  ? 'from-blue-500/10 to-blue-600/5'
                  : 'from-neutral-500/10 to-neutral-600/5'
          )}
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'h-12 w-12 rounded-xl flex items-center justify-center',
                  tier === 'enterprise'
                    ? 'bg-amber-100 dark:bg-amber-950/30'
                    : tier === 'premium'
                      ? 'bg-emerald-100 dark:bg-emerald-950/30'
                      : tier === 'trial'
                        ? 'bg-blue-100 dark:bg-blue-950/30'
                        : 'bg-neutral-100 dark:bg-neutral-800'
                )}
              >
                <Icon
                  className={cn(
                    'h-6 w-6',
                    tier === 'enterprise'
                      ? 'text-amber-600'
                      : tier === 'premium'
                        ? 'text-emerald-600'
                        : tier === 'trial'
                          ? 'text-blue-600'
                          : 'text-neutral-600'
                  )}
                />
              </div>
              <div>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                  Current Plan:{' '}
                  {subscription?.planName?.toLocaleUpperCase() + ' ' + planConfig.name}
                </h3>
                <p className="text-sm text-neutral-500 mt-0.5">
                  {organization?.name || 'Your Organization'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium',
                  isExpired
                    ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                    : tier === 'trial'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                      : tier === 'inactive'
                        ? 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400'
                        : 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400'
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
              <Button variant="ghost" size="sm" onClick={fetchData} className="h-8 w-8 p-0">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <CardContent className="p-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {expiresAt && !isExpired && tier !== 'enterprise' && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900">
                <Timer
                  className={cn(
                    'h-5 w-5',
                    daysRemaining <= 7 ? 'text-orange-500' : 'text-emerald-500'
                  )}
                />
                <div>
                  <p className="text-xs text-neutral-500">Time Remaining</p>
                  <p
                    className={cn(
                      'font-semibold',
                      daysRemaining <= 7
                        ? 'text-orange-600 dark:text-orange-400'
                        : 'text-neutral-900 dark:text-neutral-100'
                    )}
                  >
                    {daysRemaining} days left
                  </p>
                  <p className="text-xs text-neutral-400">Expires on {formatDate(expiresAt)}</p>
                </div>
              </div>
            )}

            {user && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900">
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
              <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900">
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
            <div className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-950/10 border border-amber-200 dark:border-amber-800">
              <Infinity className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Lifetime Access
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  You have lifetime access to TestForge. No renewal needed.
                </p>
              </div>
            </div>
          )}

          {isExpired && tier !== 'enterprise' && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  Subscription Expired
                </p>
                <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                  Your subscription expired on {formatDate(expiresAt!)}. Please renew to continue
                  using TestForge.
                </p>
              </div>
            </div>
          )}

          {tier === 'inactive' && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  No Active Subscription
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Please purchase a plan to continue using TestForge.
                </p>
              </div>
            </div>
          )}

          {tier === 'trial' && !isExpired && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
              <Sparkles className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  Trial Period Active
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                  You're on a {daysRemaining} day trial. Upgrade to premium to continue after trial
                  ends.
                </p>
              </div>
            </div>
          )}

          {tier === 'premium' && !isExpired && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
              <Crown className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Premium Active
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                  You have full access to all premium features.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              onClick={onUpgrade}
              className={cn(
                'flex-1',
                !isActivePlan || isExpired
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
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
              onClick={signOut}
              variant="outline"
              className="text-red-600 border-red-300 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30"
            >
              Sign Out
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 pt-4 border-t border-neutral-100 dark:border-neutral-800">
            <Lock className="h-3 w-3 text-neutral-400" />
            <span className="text-xs text-neutral-400">Secured by Razorpay</span>
            <Shield className="h-3 w-3 text-neutral-400 ml-2" />
            <span className="text-xs text-neutral-400">256-bit SSL Encryption</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ============================================
// Payment History Component
// ============================================

function PaymentHistory({ refreshTrigger }: { refreshTrigger: number }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPayments = async () => {
      setLoading(true);
      try {
        const history = await getPaymentHistory();
        setPayments(history.payments);
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
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  const paidPayments = payments.filter((p) => p.status === 'paid');

  if (paidPayments.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-16"
      >
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 mb-4">
          <History className="h-8 w-8 text-neutral-400" />
        </div>
        <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">
          No transactions yet
        </h3>
        <p className="text-sm text-neutral-500 mt-1">Your payment history will appear here</p>
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
          className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800 hover:border-emerald-200 dark:hover:border-emerald-800 transition-all"
        >
          <div className="flex items-center gap-4 mb-3 sm:mb-0">
            <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="font-medium text-neutral-900 dark:text-neutral-100">
                {payment.planName}
              </p>
              <p className="text-xs text-neutral-400 mt-0.5">{formatDate(payment.createdAt)}</p>
              {payment.endDate && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                  Valid until {formatDate(payment.endDate)}
                </p>
              )}
            </div>
          </div>
          <div className="text-right w-full sm:w-auto">
            <p className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
              {formatCurrency(payment.amount)}
            </p>
            <p className="text-xs text-emerald-600 capitalize font-medium">Paid</p>
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
  selectedPlanId,
  onSelectPlan,
  onPaymentSuccess,
}: {
  selectedPlanId: string;
  onSelectPlan: (id: string) => void;
  onPaymentSuccess: () => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const { user } = useUser();

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
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {pricingPlans.map((plan: Plan) => (
          <div key={plan.id} className="flex flex-col">
            <PricingCard
              plan={plan}
              onSelect={onSelectPlan}
              isLoading={loading === plan.id}
              selectedId={selectedPlanId}
            />
            {selectedPlanId === plan.id && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4"
              >
                <Button
                  onClick={() => handlePayment(plan)}
                  disabled={loading === plan.id}
                  className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/25 h-12 text-base"
                >
                  {loading === plan.id ? (
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
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-6 pt-8">
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
// Main Billing Page
// ============================================

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState('current');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const popularPlan = pricingPlans.find((p) => p.popular);
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
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div className="min-h-screen bg-gradient-to-b from-neutral-50 to-white dark:from-neutral-950 dark:to-neutral-900">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                Billing & Subscription
              </h1>
            </div>
            <p className="text-neutral-500 ml-13">
              Manage your plan, view payment history, and update billing information
            </p>
          </motion.div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
            <TabsList className="grid w-full max-w-md grid-cols-3 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-xl">
              <TabsTrigger
                value="current"
                className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900"
              >
                Current Plan
              </TabsTrigger>
              <TabsTrigger
                value="plans"
                className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900"
              >
                Plans
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900"
              >
                History
              </TabsTrigger>
            </TabsList>

            <AnimatePresence mode="wait">
              <TabsContent value="current" className="mt-0" key={`current-${refreshTrigger}`}>
                <CurrentPlanCard
                  onUpgrade={() => setActiveTab('plans')}
                  refreshTrigger={refreshTrigger}
                />
              </TabsContent>

              <TabsContent value="plans" className="mt-0">
                <PricingPlansSection
                  selectedPlanId={selectedPlanId}
                  onSelectPlan={setSelectedPlanId}
                  onPaymentSuccess={handlePaymentSuccess}
                />
              </TabsContent>

              <TabsContent value="history" className="mt-0" key={`history-${refreshTrigger}`}>
                <PaymentHistory refreshTrigger={refreshTrigger} />
              </TabsContent>
            </AnimatePresence>
          </Tabs>
        </div>
      </div>
    </>
  );
}
