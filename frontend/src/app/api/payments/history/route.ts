// app/api/payments/history/route.ts
import { headers } from 'next/dist/server/request/headers';
import { NextResponse } from 'next/server';

import { desc, eq } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { orgMembers, payments } from '@/lib/db/schema';

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgMember = await db.query.orgMembers.findFirst({
      where: eq(orgMembers.userId, session.user.id),
    });

    if (!orgMember) {
      return NextResponse.json({ payments: [] });
    }

    const userPayments = await db.query.payments.findMany({
      where: eq(payments.orgId, orgMember.orgId),
      orderBy: [desc(payments.createdAt)],
    });

    return NextResponse.json({ payments: userPayments });
  } catch (error) {
    console.error('Failed to fetch payments:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
