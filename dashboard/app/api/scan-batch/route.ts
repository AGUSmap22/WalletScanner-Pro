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
            balances[addresses[idx]] = item.result ? parseInt(item.result, 16) / 1e18 : 0;
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
            balances[addresses[idx]] = item.result ? parseInt(item.result, 16) / 1e18 : 0;
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
    'https://rpc.ankr.com/solana'
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
            balances[addresses[idx]] = (item.result && item.result.value !== undefined) ? item.result.value / 1e9 : 0;
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
        balances[addr] = data[addr] ? (data[addr].final_balance || 0) / 1e8 : 0;
      }
      return balances;
    }
  } catch {}
  return Object.fromEntries(addresses.map(a => [a, 0]));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize || 10, 25);
    const customPhrases: string[] = body.phrases || [];
    const userId: string = body.userId || 'public';
    const userEmail: string = body.userEmail || 'anónimo';

    let currentIdx = 0;
    let foundWalletsCount = 0;
    let totalDbPhrases = 0;

    const statId = (userId === 'public') ? 'main' : `stats_${userId}`;

    try {
      const { data: stats } = await supabaseAdmin.from('scan_stats').select('*').eq('id', statId).single();
      if (stats) {
        currentIdx = Number(stats.processed || 0);
        foundWalletsCount = Number(stats.found_wallets || 0);
        totalDbPhrases = Number(stats.total_phrases || 0);
      }
    } catch {}

    let phrasesToScan: string[] = [];

    if (customPhrases.length > 0) {
      phrasesToScan = customPhrases.slice(0, batchSize);
    } else {
      // 1. Intentar cargar semillas del usuario actual desde mnemonic_seeds
      try {
        const { data: dbSeeds, count } = await supabaseAdmin
          .from('mnemonic_seeds')
          .select('phrase', { count: 'exact' })
          .eq('user_id', userId)
          .range(currentIdx, currentIdx + batchSize - 1);

        if (count) totalDbPhrases = count;

        if (dbSeeds && dbSeeds.length > 0) {
          phrasesToScan = dbSeeds.map(s => s.phrase);
        }
      } catch {}

      // 2. Si no hay semillas personales, buscar en semillas públicas o generador BIP39
      if (phrasesToScan.length === 0) {
        const seedFilePath = path.join(process.cwd(), 'seeds_200k.txt');
        const publicSeedPath = path.join(process.cwd(), 'public', 'seeds_200k.txt');
        const targetPath = fs.existsSync(seedFilePath) ? seedFilePath : (fs.existsSync(publicSeedPath) ? publicSeedPath : null);

        if (targetPath) {
          try {
            const fileContent = fs.readFileSync(targetPath, 'utf-8');
            const lines = fileContent.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length > 0) {
              totalDbPhrases = lines.length;
              if (currentIdx >= lines.length) currentIdx = 0;
              phrasesToScan = lines.slice(currentIdx, currentIdx + batchSize);
            }
          } catch {}
        }
      }

      // 3. Fallback BIP-39
      if (phrasesToScan.length === 0) {
        for (let i = 0; i < batchSize; i++) {
          phrasesToScan.push(bip39.generateMnemonic());
        }
      }
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

    const [ethBals, bscBals, solBals, btcBals] = await Promise.all([
      checkEthBatch(ethAddrs),
      checkBscBatch(ethAddrs),
      checkSolBatch(solAddrs),
      checkBtcBatch(btcAddrs),
    ]);

    const newlyFound: Record<string, unknown>[] = [];
    const scanned_items: any[] = [];

    for (const item of validItems) {
      const eth_bal = ethBals[item.eth] || 0;
      const bsc_bal = bscBals[item.eth] || 0;
      const sol_bal = solBals[item.sol] || 0;
      const btc_bal = btcBals[item.btc] || 0;

      const detail = {
        phrase: item.phrase,
        eth_address: item.eth, eth_balance: eth_bal,
        bsc_address: item.eth, bsc_balance: bsc_bal,
        btc_address: item.btc, btc_balance: btc_bal,
        sol_address: item.sol, sol_balance: sol_bal,
      };
      scanned_items.push(detail);

      if (eth_bal > 0 || bsc_bal > 0 || sol_bal > 0 || btc_bal > 0) {
        foundWalletsCount++;
        const dbRecord = {
          ...detail,
          user_id: userId,
          user_email: userEmail
        };
        newlyFound.push(dbRecord);
        try {
          await supabaseAdmin.from('wallet_results').insert([dbRecord]);
        } catch {}
      }
    }

    const newProcessed = currentIdx + phrasesToScan.length;
    try {
      await supabaseAdmin.from('scan_stats').upsert({
        id: statId,
        user_id: userId,
        total_phrases: totalDbPhrases || newProcessed,
        processed: newProcessed,
        found_wallets: foundWalletsCount,
        is_running: true,
        updated_at: new Date().toISOString()
      });
    } catch {}

    return NextResponse.json({
      success: true,
      processed: newProcessed,
      total_phrases: totalDbPhrases || newProcessed,
      scanned_batch: phrasesToScan.length,
      found_in_batch: newlyFound.length,
      total_found: foundWalletsCount,
      scanned_items
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
