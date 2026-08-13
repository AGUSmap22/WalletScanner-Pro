import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// POST /api/stats - update scan progress (called periodically by Python scanner)
export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key');
    if (apiKey !== process.env.SCANNER_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { total_phrases, processed, found_wallets, is_running } = body;

    // Upsert the single stats row (id = 'main')
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
  } catch (err) {
    console.error('POST /api/stats error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/stats - fetch scan progress for the dashboard
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('scan_stats')
      .select('*')
      .eq('id', 'main')
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return NextResponse.json({ data: data || null });
  } catch (err) {
    console.error('GET /api/stats error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
