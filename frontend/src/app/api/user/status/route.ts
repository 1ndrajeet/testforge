// app/api/user/status/route.ts
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { eq } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { examCenters, organizations, orgMembers } from '@/lib/db/schema';

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
      return NextResponse.json({ organization: null, examCenter: null });
    }

    const organization = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgMember.orgId),
    });

    const examCenter = await db.query.examCenters.findFirst({
      where: eq(examCenters.orgId, orgMember.orgId),
    });

    return NextResponse.json({
      organization: organization
        ? {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          }
        : null,
      examCenter: examCenter
        ? {
            id: examCenter.id,
            name: examCenter.name,
            code: examCenter.code,
          }
        : null,
    });
  } catch (error) {
    console.error('Failed to fetch user status:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
