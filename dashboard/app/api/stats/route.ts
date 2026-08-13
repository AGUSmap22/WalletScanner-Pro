import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// POST /api/stats - update scan progress
export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key');
    if (apiKey !== process.env.SCANNER_API_KEY && process.env.SCANNER_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { total_phrases, processed, found_wallets, is_running } = body;

    const { data, error } = await supabaseAdmin
      .from('scan_stats')
      .upsert([{
        id: 'main',
        total_phrases: total_phrases || 0,
        processed: processed || 0,
        found_wallets: found_wallets || 0,
        is_running: is_running ?? true,
        updated_at: new Date().toISOString(),
      }], { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Database error';
    console.warn('POST /api/stats warning:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET /api/stats - fetch scan progress
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('scan_stats')
      .select('*')
      .eq('id', 'main')
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return NextResponse.json({ data: data || null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Database error';
    console.warn('GET /api/stats warning:', msg);
    return NextResponse.json({ data: null, warning: 'Supabase no configurado o inalcanzable' });
  }
}
