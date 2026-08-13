'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Wallet, TrendingUp, Search, RefreshCw, Copy, ExternalLink,
  Activity, Zap, Shield, Clock, CheckCircle, Coins
} from 'lucide-react';
import type { WalletResult, ScanStats } from '@/lib/types';

// ─── Utility ─────────────────────────────────────────────────────────────────

function shortenAddress(addr: string | null): string {
  if (!addr) return '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `hace ${Math.floor(diff)}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

function formatBalance(n: number): string {
  if (!n || n === 0) return '0.000000';
  if (n < 0.001) return n.toExponential(3);
  return n.toFixed(6);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleCopy} title="Copiar" style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: copied ? 'var(--accent-green)' : 'var(--text-muted)',
      padding: '2px', display: 'inline-flex', alignItems: 'center',
      transition: 'color 0.2s', marginLeft: '4px'
    }}>
      {copied ? <CheckCircle size={12} /> : <Copy size={12} />}
    </button>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'var(--accent-blue)',
  glow = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  glow?: boolean;
}) {
  return (
    <div className="glass-card" style={{
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      boxShadow: glow ? `0 0 30px ${color}20` : undefined,
      borderColor: glow ? `${color}40` : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `${color}18`,
          border: `1px solid ${color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color,
        }}>
          <Icon size={18} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>
      <div>
        <div className="stat-number" style={{ color }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0;
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Progreso del escaneo</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-cyan)' }}>{pct.toFixed(2)}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{value.toLocaleString()} procesadas</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{total.toLocaleString()} totales</span>
      </div>
    </div>
  );
}

function WalletRow({ wallet, index }: { wallet: WalletResult; index: number }) {
  const ethBal = wallet.eth_balance || 0;
  const bscBal = wallet.bsc_balance || 0;
  const btcBal = wallet.btc_balance || 0;
  const solBal = wallet.sol_balance || 0;
  const hasBalance = ethBal > 0 || bscBal > 0 || btcBal > 0 || solBal > 0;

  return (
    <tr className={`wallet-table-row ${hasBalance ? 'row-found' : ''}`}
      style={{ animationDelay: `${index * 0.05}s` }}>
      {/* Frase semilla */}
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono" style={{
            maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', display: 'block', fontSize: 11,
          }}>
            {wallet.phrase}
          </span>
          <CopyBtn text={wallet.phrase} />
        </div>
      </td>

      {/* ETH */}
      <td>
        {wallet.eth_address ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="tag-eth">ETH</span>
              <span className="mono">{shortenAddress(wallet.eth_address)}</span>
              <CopyBtn text={wallet.eth_address} />
              <a href={`https://etherscan.io/address/${wallet.eth_address}`} target="_blank" rel="noreferrer"
                style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
                <ExternalLink size={11} />
              </a>
            </div>
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: ethBal > 0 ? 'var(--accent-green)' : 'var(--text-muted)'
            }}>
              {formatBalance(ethBal)} ETH
            </span>
          </div>
        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </td>

      {/* BSC */}
      <td>
        {wallet.bsc_address || wallet.eth_address ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                background: 'rgba(240, 185, 11, 0.15)', border: '1px solid rgba(240, 185, 11, 0.3)',
                color: '#f0b90b', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4
              }}>BSC</span>
              <span className="mono">{shortenAddress(wallet.bsc_address || wallet.eth_address)}</span>
              <CopyBtn text={wallet.bsc_address || wallet.eth_address || ''} />
              <a href={`https://bscscan.com/address/${wallet.bsc_address || wallet.eth_address}`} target="_blank" rel="noreferrer"
                style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
                <ExternalLink size={11} />
              </a>
            </div>
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: bscBal > 0 ? '#f0b90b' : 'var(--text-muted)'
            }}>
              {formatBalance(bscBal)} BNB
            </span>
          </div>
        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </td>

      {/* BTC */}
      <td>
        {wallet.btc_address ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                background: 'rgba(247, 147, 26, 0.15)', border: '1px solid rgba(247, 147, 26, 0.3)',
                color: '#f7931a', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4
              }}>BTC</span>
              <span className="mono">{shortenAddress(wallet.btc_address)}</span>
              <CopyBtn text={wallet.btc_address} />
              <a href={`https://mempool.space/address/${wallet.btc_address}`} target="_blank" rel="noreferrer"
                style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
                <ExternalLink size={11} />
              </a>
            </div>
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: btcBal > 0 ? '#f7931a' : 'var(--text-muted)'
            }}>
              {formatBalance(btcBal)} BTC
            </span>
          </div>
        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </td>

      {/* SOL */}
      <td>
        {wallet.sol_address ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="tag-sol">SOL</span>
              <span className="mono">{shortenAddress(wallet.sol_address)}</span>
              <CopyBtn text={wallet.sol_address} />
              <a href={`https://solscan.io/account/${wallet.sol_address}`} target="_blank" rel="noreferrer"
                style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
                <ExternalLink size={11} />
              </a>
            </div>
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: solBal > 0 ? 'var(--accent-purple)' : 'var(--text-muted)'
            }}>
              {formatBalance(solBal)} SOL
            </span>
          </div>
        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </td>

      {/* Balance badge */}
      <td>
        {hasBalance ? (
          <span className="tag-balance">💰 Con saldo</span>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin saldo</span>
        )}
      </td>

      {/* Fecha */}
      <td>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{timeAgo(wallet.found_at)}</span>
      </td>
    </tr>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [wallets, setWallets] = useState<WalletResult[]>([]);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [filter, setFilter] = useState<'all' | 'found'>('all');
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [walletsRes, statsRes] = await Promise.all([
        fetch('/api/wallets'),
        fetch('/api/stats'),
      ]);
      const walletsData = await walletsRes.json();
      const statsData = await statsRes.json();
      if (walletsData.data) setWallets(walletsData.data);
      if (statsData.data) setStats(statsData.data);
      setLastRefresh(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // auto-refresh every 5s
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredWallets = wallets
    .filter(w => filter === 'all' || (w.eth_balance || 0) > 0 || (w.bsc_balance || 0) > 0 || (w.btc_balance || 0) > 0 || (w.sol_balance || 0) > 0)
    .filter(w => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        w.phrase.toLowerCase().includes(q) ||
        w.eth_address?.toLowerCase().includes(q) ||
        w.bsc_address?.toLowerCase().includes(q) ||
        w.btc_address?.toLowerCase().includes(q) ||
        w.sol_address?.toLowerCase().includes(q)
      );
    });

  const foundWallets = wallets.filter(w => (w.eth_balance || 0) > 0 || (w.bsc_balance || 0) > 0 || (w.btc_balance || 0) > 0 || (w.sol_balance || 0) > 0);
  const totalEth = foundWallets.reduce((s, w) => s + (w.eth_balance || 0), 0);
  const totalBsc = foundWallets.reduce((s, w) => s + (w.bsc_balance || 0), 0);
  const totalBtc = foundWallets.reduce((s, w) => s + (w.btc_balance || 0), 0);
  const totalSol = foundWallets.reduce((s, w) => s + (w.sol_balance || 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>

      {/* ── Header ── */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        background: 'rgba(10, 11, 15, 0.9)',
        backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{
          maxWidth: 1400, margin: '0 auto',
          padding: '0 24px', height: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Wallet size={18} color="white" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>WalletScanner Pro</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ETH · BSC · BTC · SOL · Live Dashboard</div>
            </div>
          </div>

          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Actualizado {timeAgo(lastRefresh.toISOString())}
            </span>
            {stats?.is_running ? (
              <span className="live-badge">
                <span className="live-dot" />
                Escaneando
              </span>
            ) : (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--text-muted)',
                background: 'rgba(74, 85, 104, 0.1)',
                border: '1px solid rgba(74, 85, 104, 0.2)',
                borderRadius: 20, padding: '4px 10px',
              }}>
                <Activity size={10} /> Detenido
              </span>
            )}
            <button onClick={fetchData} title="Refrescar" style={{
              background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 8, padding: '6px 8px', cursor: 'pointer',
              color: 'var(--accent-blue)', display: 'flex', alignItems: 'center',
              transition: 'background 0.2s',
            }}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 24px' }}>

        {/* ── Stat Cards ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16, marginBottom: 28,
        }}>
          <StatCard
            icon={Search}
            label="Frases escaneadas"
            value={stats?.processed?.toLocaleString() ?? (loading ? '…' : '0')}
            sub={`de ${stats?.total_phrases?.toLocaleString() ?? '?'} totales`}
            color="var(--accent-blue)"
          />
          <StatCard
            icon={Zap}
            label="Wallets con saldo"
            value={stats?.found_wallets ?? (loading ? '…' : 0)}
            sub={`${foundWallets.length} en esta sesión`}
            color="var(--accent-green)"
            glow={foundWallets.length > 0}
          />
          <StatCard
            icon={TrendingUp}
            label="ETH total"
            value={`${formatBalance(totalEth)} ETH`}
            sub="Suma de saldos Ethereum"
            color="var(--accent-blue)"
          />
          <StatCard
            icon={Coins}
            label="BSC (BNB) total"
            value={`${formatBalance(totalBsc)} BNB`}
            sub="Suma de saldos BNB Chain"
            color="#f0b90b"
          />
          <StatCard
            icon={Coins}
            label="BTC total"
            value={`${formatBalance(totalBtc)} BTC`}
            sub="Suma de saldos Bitcoin"
            color="#f7931a"
          />
          <StatCard
            icon={Shield}
            label="SOL total"
            value={`${formatBalance(totalSol)} SOL`}
            sub="Suma de saldos Solana"
            color="var(--accent-purple)"
          />
        </div>

        {/* ── Progress ── */}
        {stats && (
          <div className="glass-card" style={{ padding: '20px 24px', marginBottom: 28 }}>
            <ProgressBar value={stats.processed} total={stats.total_phrases} />
          </div>
        )}

        {/* ── Wallets Table ── */}
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          {/* Table header bar */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Wallet size={16} color="var(--accent-blue)" />
              <span style={{ fontWeight: 700, fontSize: 14 }}>Resultados</span>
              <span style={{
                background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
                borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
                color: 'var(--accent-blue)',
              }}>
                {filteredWallets.length}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {/* Search */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '6px 12px',
              }}>
                <Search size={13} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Buscar dirección o frase…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    background: 'none', border: 'none', outline: 'none',
                    color: 'var(--text-primary)', fontSize: 13,
                    width: 220,
                  }}
                />
              </div>

              {/* Filter */}
              <div style={{ display: 'flex', gap: 6 }}>
                {(['all', 'found'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.2s',
                      background: filter === f ? 'var(--accent-blue)' : 'transparent',
                      color: filter === f ? 'white' : 'var(--text-muted)',
                      border: filter === f ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                    }}
                  >
                    {f === 'all' ? 'Todas' : '💰 Con saldo'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table body */}
          <div style={{ overflowX: 'auto' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={24} className="animate-spin-slow" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: 13 }}>Cargando datos…</div>
              </div>
            ) : filteredWallets.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                <Search size={32} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {filter === 'found' ? 'Aún no se han encontrado wallets con saldo' : 'Sin resultados'}
                </div>
                <div style={{ fontSize: 12 }}>
                  {filter === 'found'
                    ? 'El scanner está trabajando. Los resultados aparecerán aquí en tiempo real.'
                    : 'Inicia el script de Python para comenzar el escaneo.'}
                </div>
              </div>
            ) : (
              <table className="wallet-table">
                <thead>
                  <tr>
                    <th>Frase semilla</th>
                    <th>ETH</th>
                    <th>BSC (BNB)</th>
                    <th>BTC</th>
                    <th>SOL</th>
                    <th>Estado</th>
                    <th>Encontrada</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWallets.map((w, i) => (
                    <WalletRow key={w.id} wallet={w} index={i} />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {filteredWallets.length > 0 && (
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              fontSize: 11, color: 'var(--text-muted)',
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span>Mostrando {filteredWallets.length} de {wallets.length} resultados</span>
              <span>Auto-refresh cada 5s · <span style={{ color: 'var(--accent-green)' }}>●</span> Activo</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
