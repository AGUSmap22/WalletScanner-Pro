import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import * as bip39 from 'bip39';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId') || 'public';
    const role = req.nextUrl.searchParams.get('role') || 'user';

    let query = supabaseAdmin.from('mnemonic_seeds').select('*', { count: 'exact', head: true });
    
    // Si no es admin, filtrar solo las semillas de este usuario
    if (role !== 'admin') {
      query = query.eq('user_id', userId);
    }

    const { count, error } = await query;
    if (error) throw error;
    return NextResponse.json({ count: count || 0 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error reading seeds';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawText: string = body.text || '';
    const phrasesArray: string[] = body.phrases || [];
    const userId: string = body.userId || 'public';

    let phrases: string[] = [];

    if (rawText) {
      phrases = rawText.split('\n').map(p => p.trim()).filter(Boolean);
    } else if (phrasesArray.length > 0) {
      phrases = phrasesArray.map(p => p.trim()).filter(Boolean);
    }

    const validPhrases = [...new Set(phrases.filter(p => bip39.validateMnemonic(p)))];

    if (validPhrases.length === 0) {
      return NextResponse.json({ error: 'No se encontraron frases mnemónicas BIP39 válidas.' }, { status: 400 });
    }

    const batchSize = 500;
    let insertedCount = 0;

    for (let i = 0; i < validPhrases.length; i += batchSize) {
      const batch = validPhrases.slice(i, i + batchSize).map(phrase => ({
        user_id: userId,
        phrase
      }));
      const { error } = await supabaseAdmin.from('mnemonic_seeds').insert(batch);
      if (!error) {
        insertedCount += batch.length;
      }
    }

    // Actualizar total_phrases en scan_stats para este usuario
    const { count } = await supabaseAdmin
      .from('mnemonic_seeds')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    await supabaseAdmin.from('scan_stats').upsert({
      id: userId === 'public' ? 'main' : `stats_${userId}`,
      user_id: userId,
      total_phrases: count || insertedCount,
      updated_at: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      added: insertedCount,
      total: count || insertedCount
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error uploading seeds';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId') || 'public';
    await supabaseAdmin.from('mnemonic_seeds').delete().eq('user_id', userId);
    await supabaseAdmin.from('scan_stats').upsert({
      id: userId === 'public' ? 'main' : `stats_${userId}`,
      user_id: userId,
      total_phrases: 0,
      processed: 0,
      found_wallets: 0,
      updated_at: new Date().toISOString()
    });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error clearing seeds';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
