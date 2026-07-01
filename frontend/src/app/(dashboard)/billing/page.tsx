// app/billing/page.tsx
import { getCurrentSubscription, getPaymentHistory } from '@/lib/actions/subscription';
import { getCurrentExamCenter, getCurrentUser } from '@/lib/session';
import { getCurrentOrg } from '@/lib/session';

import { BillingClient } from './billing-client';

export default async function BillingPage() {
  const [user, examCenter, subscription, orgData, payments] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentExamCenter().catch(() => null),
    getCurrentSubscription().catch(() => null),
    getCurrentOrg().catch(() => null),
    getPaymentHistory().catch(() => ({ payments: [] })),
  ]);

  return (
    <BillingClient
      user={user ? { id: user.id, name: user.name, email: user.email } : null}
      examCenter={
        examCenter ? { id: examCenter.id, name: examCenter.name, code: examCenter.code } : null
      }
      subscription={subscription}
      organization={orgData?.org ? { id: orgData.org.id, name: orgData.org.name } : null}
      initialPayments={payments.payments}
    />
  );
}
