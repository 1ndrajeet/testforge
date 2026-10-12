import { NextResponse } from 'next/server';

import { getUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const { data: examCenter, error } = await supabase
      .from('exam_centers')
      .select('id, name, code')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch user status:', error);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    if (!examCenter) {
      return NextResponse.json({ organization: null, examCenter: null });
    }

    return NextResponse.json({
      organization: {
        id: examCenter.id,
        name: examCenter.name,
        slug: examCenter.code,
      },
      examCenter: {
        id: examCenter.id,
        name: examCenter.name,
        code: examCenter.code,
      },
    });
  } catch (error) {
    console.error('Failed to fetch user status:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
