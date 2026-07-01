import { NextResponse } from 'next/server';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);

    return NextResponse.json({
      database: 'ok',
    });
  } catch (error) {
    return NextResponse.json(
      {
        database: 'failed',
        error: String(error),
      },
      { status: 500 },
    );
  }
}
