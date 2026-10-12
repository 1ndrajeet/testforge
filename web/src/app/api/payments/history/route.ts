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
    const { data: examCenter } = await supabase
      .from('exam_centers')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (!examCenter) {
      return NextResponse.json({ payments: [] });
    }

    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .eq('exam_center_id', examCenter.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch payments:', error);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    return NextResponse.json({ payments: payments || [] });
  } catch (error) {
    console.error('Failed to fetch payments:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
