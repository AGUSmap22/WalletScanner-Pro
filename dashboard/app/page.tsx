'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wallet, TrendingUp, Search, RefreshCw, Copy, ExternalLink,
  Activity, Zap, Shield, CheckCircle, Coins, Play, Pause,
  Terminal, Settings, Lock, Upload, Trash2, Key, ChevronDown, Check
} from 'lucide-react';
import type { WalletResult, ScanStats } from '@/lib/types';

// ─── Utility Functions ────────────────────────────────────────────────────────

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

interface ScannedLogItem {
  id: string;
  phrase: string;
  eth_address: string;
  eth_balance: number;
  bsc_address: string;
  bsc_balance: number;
  btc_address: string;
  btc_balance: number;
  sol_address: string;
  sol_balance: number;
  hasBalance: boolean;
  timestamp: string;
}

// ─── Componentes auxiliares ───────────────────────────────────────────────────

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
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{total.toLocaleString()} totales en DB</span>
      </div>
    </div>
  );
}

// ─── Dashboard Principal ──────────────────────────────────────────────────────

export default function Dashboard() {
  const [wallets, setWallets] = useState<WalletResult[]>([]);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [filter, setFilter] = useState<'all' | 'found'>('all');
  const [search, setSearch] = useState('');
  
  // Estado del escáner y consola
  const [isScanning, setIsScanning] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<ScannedLogItem[]>([]);
  const [showConsole, setShowConsole] = useState(true);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const isScanningRef = useRef(false);

  // Modales y Auth
  const [isLoggedIn, setIsLoggedIn] = useState(true); // admin activo por defecto
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  
  // Alimentador de Semillas
  const [seedText, setSeedText] = useState('');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Scroll automático en consola
  useEffect(() => {
    if (showConsole && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs, showConsole]);

  // Loop de Escaneo Cloud en Vercel con emisión de logs en consola
  useEffect(() => {
    isScanningRef.current = isScanning;
    let active = true;

    async function runScanLoop() {
      while (active && isScanningRef.current) {
        try {
          const res = await fetch('/api/scan-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batchSize: 10 }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.scanned_items && Array.isArray(data.scanned_items)) {
              const newItems: ScannedLogItem[] = data.scanned_items.map((item: any) => ({
                id: Math.random().toString(36).substr(2, 9),
                phrase: item.phrase,
                eth_address: item.eth_address,
                eth_balance: item.eth_balance,
                bsc_address: item.bsc_address,
                bsc_balance: item.bsc_balance,
                btc_address: item.btc_address,
                btc_balance: item.btc_balance,
                sol_address: item.sol_address,
                sol_balance: item.sol_balance,
                hasBalance: item.eth_balance > 0 || item.bsc_balance > 0 || item.btc_balance > 0 || item.sol_balance > 0,
                timestamp: new Date().toLocaleTimeString()
              }));

              setConsoleLogs(prev => [...prev.slice(-100), ...newItems]); // Mantener últimos 100 en memoria
            }
            await fetchData();
          }
        } catch (err) {
          console.error('Scan loop error:', err);
        }
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    if (isScanning) {
      runScanLoop();
    }

    return () => {
      active = false;
    };
  }, [isScanning, fetchData]);

  // Carga masiva de semillas a la base de datos Supabase
  const handleUploadSeeds = async () => {
    if (!seedText.trim()) return;
    setUploading(true);
    setUploadStatus('Cargando semillas a la base de datos…');
    try {
      const res = await fetch('/api/admin/seeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: seedText })
      });
      const data = await res.json();
      if (res.ok) {
        setUploadStatus(`✅ ${data.added} frases mnemónicas guardadas exitosamente en la base de datos (Total: ${data.total}).`);
        setSeedText('');
        fetchData();
      } else {
        setUploadStatus(`❌ Error: ${data.error}`);
      }
    } catch (e: any) {
      setUploadStatus(`❌ Error de conexión: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleClearSeeds = async () => {
    if (!confirm('¿Estás seguro de borrar todas las semillas guardadas de la base de datos?')) return;
    setUploading(true);
    try {
      await fetch('/api/admin/seeds', { method: 'DELETE' });
      setUploadStatus('🗑️ Base de datos de semillas limpiada correctamente.');
      fetchData();
    } catch (e: any) {
      setUploadStatus(`❌ Error: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

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

      {/* ── Encabezado ── */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        background: 'rgba(10, 11, 15, 0.9)',
        backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{
          maxWidth: 1400, margin: '0 auto',
          padding: '0 24px', height: 64,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(59,130,246,0.3)'
            }}>
              <Wallet size={20} color="white" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                WalletScanner Pro <span style={{ fontSize: 10, background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-green)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(16, 185, 129, 0.3)' }}>Cloud & DB</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Escaneo Multired en Vivo · ETH · BSC · BTC · SOL</div>
            </div>
          </div>

          {/* Controles de Acción */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Botón Consola */}
            <button
              onClick={() => setShowConsole(!showConsole)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', background: showConsole ? 'rgba(59,130,246,0.2)' : 'var(--bg-secondary)',
                color: showConsole ? 'var(--accent-blue)' : 'var(--text-muted)',
                border: '1px solid var(--border)'
              }}
            >
              <Terminal size={14} /> Consola en Vivo
            </button>

            {/* Configuración / Alimentador DB */}
            <button
              onClick={() => setShowSettingsModal(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', background: 'var(--bg-secondary)',
                color: 'var(--text-primary)', border: '1px solid var(--border)'
              }}
            >
              <Settings size={14} /> Base de Datos & Frases
            </button>

            {/* Iniciar Escaneo */}
            <button
              onClick={() => setIsScanning(!isScanning)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.2s',
                background: isScanning ? 'rgba(239, 68, 68, 0.15)' : 'linear-gradient(135deg, var(--accent-blue), var(--accent-green))',
                color: isScanning ? '#ef4444' : 'white',
                border: isScanning ? '1px solid rgba(239, 68, 68, 0.3)' : 'none',
                boxShadow: isScanning ? undefined : '0 0 15px rgba(16, 185, 129, 0.3)'
              }}
            >
              {isScanning ? <><Pause size={14} /> Pausar Escaneo</> : <><Play size={14} /> ⚡ Iniciar Escaneo Cloud</>}
            </button>

            <button onClick={fetchData} title="Refrescar" style={{
              background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
              color: 'var(--accent-blue)', display: 'flex', alignItems: 'center',
            }}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Contenido Principal ── */}
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>

        {/* ── Tarjetas Estadísticas ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16, marginBottom: 24,
        }}>
          <StatCard
            icon={Search}
            label="Frases escaneadas"
            value={stats?.processed?.toLocaleString() ?? (loading ? '…' : '0')}
            sub={`de ${stats?.total_phrases?.toLocaleString() ?? '?'} en Base de Datos`}
            color="var(--accent-blue)"
          />
          <StatCard
            icon={Zap}
            label="Wallets con saldo"
            value={stats?.found_wallets ?? (loading ? '…' : 0)}
            sub={`${foundWallets.length} guardadas`}
            color="var(--accent-green)"
            glow={foundWallets.length > 0}
          />
          <StatCard
            icon={TrendingUp}
            label="ETH total"
            value={`${formatBalance(totalEth)} ETH`}
            sub="Suma Ethereum"
            color="var(--accent-blue)"
          />
          <StatCard
            icon={Coins}
            label="BSC (BNB) total"
            value={`${formatBalance(totalBsc)} BNB`}
            sub="Suma BNB Chain"
            color="#f0b90b"
          />
          <StatCard
            icon={Coins}
            label="BTC total"
            value={`${formatBalance(totalBtc)} BTC`}
            sub="Suma Bitcoin"
            color="#f7931a"
          />
          <StatCard
            icon={Shield}
            label="SOL total"
            value={`${formatBalance(totalSol)} SOL`}
            sub="Suma Solana"
            color="var(--accent-purple)"
          />
        </div>

        {/* ── Barra de Progreso ── */}
        {stats && (
          <div className="glass-card" style={{ padding: '16px 20px', marginBottom: 24 }}>
            <ProgressBar value={stats.processed} total={stats.total_phrases} />
          </div>
        )}

        {/* ── Consola / Terminal en Vivo (.py Style) ── */}
        {showConsole && (
          <div className="glass-card" style={{ marginBottom: 24, overflow: 'hidden', border: '1px solid rgba(59,130,246,0.3)' }}>
            {/* Header consola */}
            <div style={{
              background: '#090a0f', padding: '10px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Terminal size={15} color="var(--accent-green)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-green)', fontFamily: 'monospace' }}>
                  terminal@wallet-scanner:~# {isScanning ? 'escaneando_lotes...' : 'pausado'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setConsoleLogs([])}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}
                >
                  Limpiar pantalla
                </button>
              </div>
            </div>

            {/* Cuerpo terminal */}
            <div style={{
              background: '#050608', color: '#00ff66',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: 12, padding: '16px', height: 260, overflowY: 'auto',
              lineHeight: 1.5
            }}>
              {consoleLogs.length === 0 ? (
                <div style={{ color: '#4a5568' }}>
                  &gt; Presiona <strong style={{ color: '#00ff66' }}>⚡ Iniciar Escaneo Cloud</strong> arriba para comenzar a transmitir los logs en vivo…
                </div>
              ) : (
                consoleLogs.map((log) => (
                  <div key={log.id} style={{ marginBottom: 12, opacity: log.hasBalance ? 1 : 0.9 }}>
                    <div style={{ color: log.hasBalance ? '#ffe600' : '#00e5ff', fontWeight: 'bold' }}>
                      [{log.hasBalance ? '💰 VÁLIDA CON SALDO' : 'VÁLIDA'}] [{log.timestamp}] {log.phrase}
                    </div>
                    <div style={{ paddingLeft: 12, color: '#a0aec0' }}>
                      ├─ <span style={{ color: '#6366f1' }}>ETH</span>: {log.eth_address} | Saldo: <span style={{ color: log.eth_balance > 0 ? '#00ff66' : '#a0aec0', fontWeight: log.eth_balance > 0 ? 'bold' : 'normal' }}>{log.eth_balance.toFixed(6)} ETH</span>
                    </div>
                    <div style={{ paddingLeft: 12, color: '#a0aec0' }}>
                      ├─ <span style={{ color: '#f0b90b' }}>BSC</span>: {log.bsc_address} | Saldo: <span style={{ color: log.bsc_balance > 0 ? '#f0b90b' : '#a0aec0', fontWeight: log.bsc_balance > 0 ? 'bold' : 'normal' }}>{log.bsc_balance.toFixed(6)} BNB</span>
                    </div>
                    <div style={{ paddingLeft: 12, color: '#a0aec0' }}>
                      ├─ <span style={{ color: '#f7931a' }}>BTC</span>: {log.btc_address} | Saldo: <span style={{ color: log.btc_balance > 0 ? '#f7931a' : '#a0aec0', fontWeight: log.btc_balance > 0 ? 'bold' : 'normal' }}>{log.btc_balance.toFixed(8)} BTC</span>
                    </div>
                    <div style={{ paddingLeft: 12, color: '#a0aec0' }}>
                      └─ <span style={{ color: '#a855f7' }}>SOL</span>: {log.sol_address} | Saldo: <span style={{ color: log.sol_balance > 0 ? '#a855f7' : '#a0aec0', fontWeight: log.sol_balance > 0 ? 'bold' : 'normal' }}>{log.sol_balance.toFixed(6)} SOL</span>
                    </div>
                  </div>
                ))
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>
        )}

        {/* ── Tabla de Resultados de Supabase ── */}
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Wallet size={16} color="var(--accent-blue)" />
              <span style={{ fontWeight: 700, fontSize: 14 }}>Resultados Guardados en Base de Datos</span>
              <span style={{
                background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
                borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600,
                color: 'var(--accent-blue)',
              }}>
                {filteredWallets.length}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
                    color: 'var(--text-primary)', fontSize: 13, width: 220,
                  }}
                />
              </div>

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

          <div style={{ overflowX: 'auto' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={24} className="animate-spin-slow" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: 13 }}>Cargando datos…</div>
              </div>
            ) : filteredWallets.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                <Search size={32} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin resultados con saldo guardados</div>
                <div style={{ fontSize: 12 }}>
                  Alimenta frases mnemónicas en la pestaña <strong>Base de Datos & Frases</strong> y presiona <strong>⚡ Iniciar Escaneo</strong>.
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
                    <tr key={w.id} className="wallet-table-row row-found">
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="mono" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                            {w.phrase}
                          </span>
                          <CopyBtn text={w.phrase} />
                        </div>
                      </td>
                      <td>
                        {w.eth_address ? (
                          <div>
                            <span className="mono">{shortenAddress(w.eth_address)}</span>
                            <div style={{ fontSize: 11, color: 'var(--accent-green)', fontWeight: 700 }}>
                              {formatBalance(w.eth_balance || 0)} ETH
                            </div>
                          </div>
                        ) : '—'}
                      </td>
                      <td>
                        {w.bsc_address || w.eth_address ? (
                          <div>
                            <span className="mono">{shortenAddress(w.bsc_address || w.eth_address)}</span>
                            <div style={{ fontSize: 11, color: '#f0b90b', fontWeight: 700 }}>
                              {formatBalance(w.bsc_balance || 0)} BNB
                            </div>
                          </div>
                        ) : '—'}
                      </td>
                      <td>
                        {w.btc_address ? (
                          <div>
                            <span className="mono">{shortenAddress(w.btc_address)}</span>
                            <div style={{ fontSize: 11, color: '#f7931a', fontWeight: 700 }}>
                              {formatBalance(w.btc_balance || 0)} BTC
                            </div>
                          </div>
                        ) : '—'}
                      </td>
                      <td>
                        {w.sol_address ? (
                          <div>
                            <span className="mono">{shortenAddress(w.sol_address)}</span>
                            <div style={{ fontSize: 11, color: 'var(--accent-purple)', fontWeight: 700 }}>
                              {formatBalance(w.sol_balance || 0)} SOL
                            </div>
                          </div>
                        ) : '—'}
                      </td>
                      <td><span className="tag-balance">💰 Con saldo</span></td>
                      <td><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{timeAgo(w.found_at)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      {/* ── Modal de Configuración & Carga de Semillas ── */}
      {showSettingsModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20
        }}>
          <div className="glass-card" style={{
            maxWidth: 650, width: '100%', padding: 28,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Settings size={20} color="var(--accent-blue)" />
                <h3 style={{ margin: 0, fontSize: 18 }}>Alimentador de Frases en la Base de Datos</h3>
              </div>
              <button onClick={() => setShowSettingsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 16 }}>
              Pega tus frases mnemónicas (una por línea) o sube tu archivo `.txt`. Se guardarán de forma persistente en la tabla <code>mnemonic_seeds</code> de tu Supabase.
            </p>

            <textarea
              rows={8}
              placeholder="Pega aquí tus frases mnemónicas de 12 o 24 palabras (una por línea)..."
              value={seedText}
              onChange={e => setSeedText(e.target.value)}
              style={{
                width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)',
                borderRadius: 8, padding: 12, color: 'var(--text-primary)', fontFamily: 'monospace',
                fontSize: 12, resize: 'vertical', outline: 'none', marginBottom: 16
              }}
            />

            {uploadStatus && (
              <div style={{
                fontSize: 12, padding: '10px 14px', borderRadius: 6,
                background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
                marginBottom: 16, color: 'var(--text-primary)'
              }}>
                {uploadStatus}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <button
                onClick={handleClearSeeds}
                disabled={uploading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600
                }}
              >
                <Trash2 size={14} /> Limpiar Base de Datos
              </button>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  style={{
                    padding: '8px 16px', borderRadius: 8, background: 'transparent',
                    color: 'var(--text-muted)', border: '1px solid var(--border)',
                    cursor: 'pointer', fontSize: 13
                  }}
                >
                  Cerrar
                </button>
                <button
                  onClick={handleUploadSeeds}
                  disabled={uploading}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 20px', borderRadius: 8,
                    background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                    color: 'white', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700
                  }}
                >
                  <Upload size={14} /> {uploading ? 'Guardando...' : 'Guardar en Supabase'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
