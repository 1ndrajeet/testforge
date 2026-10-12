import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('exam_centers').select('id').limit(1);

    if (error) {
      return NextResponse.json(
        {
          database: 'failed',
          error: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      database: 'ok',
    });
  } catch (error) {
    return NextResponse.json(
      {
        database: 'failed',
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
