import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/stats - fetch stats for dashboard
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId') || 'public';
    const role = req.nextUrl.searchParams.get('role') || 'user';

    const statId = (role === 'admin') ? 'main' : (userId === 'public' ? 'main' : `stats_${userId}`);

    // Consultas en paralelo: stats guardados + conteo real de semillas
    const [statsResult, seedCountResult] = await Promise.all([
      supabaseAdmin.from('scan_stats').select('*').eq('id', statId).maybeSingle(),
      role === 'admin'
        ? supabaseAdmin.from('mnemonic_seeds').select('id', { count: 'exact', head: true })
        : supabaseAdmin.from('mnemonic_seeds').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);

    const realSeedCount = seedCountResult.count ?? 0;
    const stats = statsResult.data;

    // Fusionar: priorizar el conteo real de semillas sobre el valor en scan_stats
    const enriched = stats
      ? { ...stats, total_phrases: realSeedCount || stats.total_phrases || 0 }
      : {
          id: statId,
          processed: 0,
          found_wallets: 0,
          total_phrases: realSeedCount,
          is_running: false,
        };

    return NextResponse.json({ data: enriched });
  } catch (err: unknown) {
    return NextResponse.json({ data: null });
  }
}

// POST /api/stats - update scan stats
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, total_phrases, processed, found_wallets, is_running } = body;
    const statId = (!userId || userId === 'public') ? 'main' : `stats_${userId}`;

    const { data, error } = await supabaseAdmin
      .from('scan_stats')
      .upsert([{
        id: statId,
        user_id: userId || 'public',
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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
