// components/layout/header-wrapper.tsx
import { getCurrentSubscription } from '@/lib/actions/subscription';
import { getCurrentExamCenter, getCurrentUser } from '@/lib/session';

import { Header } from './header';

export async function HeaderWrapper() {
  const [user, examCenter, subscription] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentExamCenter().catch(() => null),
    getCurrentSubscription().catch(() => null),
  ]);

  return (
    <Header
      user={user ? { ...user, image: user.image ?? undefined } : null}
      examCenter={examCenter ?? null}
      subscription={subscription ? { ...subscription, isActive: subscription.isActive ?? false } : null}
    />
  );
}
