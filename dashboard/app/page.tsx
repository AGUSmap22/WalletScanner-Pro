'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wallet, TrendingUp, Search, RefreshCw, Copy, CheckCircle,
  Zap, Shield, Coins, Play, Pause, Terminal, Settings, Upload,
  Trash2, LogIn, LogOut, ShieldAlert, Users, UserCog
} from 'lucide-react';
import type { WalletResult, ScanStats } from '@/lib/types';

interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'user';
}

interface UserProfile {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

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
  icon: Icon, label, value, sub, color = 'var(--accent-blue)', glow = false,
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string; glow?: boolean;
}) {
  return (
    <div className="glass-card" style={{
      padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px',
      boxShadow: glow ? `0 0 30px ${color}20` : undefined,
      borderColor: glow ? `${color}40` : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: `${color}18`,
          border: `1px solid ${color}30`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color,
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

export default function Dashboard() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false); // true after localStorage checked
  const [wallets, setWallets] = useState<WalletResult[]>([]);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'found'>('all');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'scanner' | 'admin'>('scanner');

  // Escáner y consola
  const [isScanning, setIsScanning] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<ScannedLogItem[]>([]);
  const [showConsole, setShowConsole] = useState(true);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const isScanningRef = useRef(false);

  // Auth
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Semillas
  const [seedText, setSeedText] = useState('');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Panel admin — lista de usuarios
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [roleActionStatus, setRoleActionStatus] = useState<string | null>(null);

  // Cargar usuario guardado (solo una vez)
  useEffect(() => {
    const saved = localStorage.getItem('wallet_scanner_user');
    if (saved) {
      try { setCurrentUser(JSON.parse(saved)); } catch {}
    }
    setAuthReady(true);
  }, []);

  const fetchData = useCallback(async () => {
    if (!currentUser) { setLoading(false); return; } // No user → no data
    const uId = currentUser.id;
    const role = currentUser.role;

    try {
      const [walletsRes, statsRes] = await Promise.all([
        fetch(`/api/wallets?userId=${uId}&role=${role}`),
        fetch(`/api/stats?userId=${uId}&role=${role}`),
      ]);
      const walletsData = await walletsRes.json();
      const statsData = await statsRes.json();
      if (walletsData.data) setWallets(walletsData.data);
      if (statsData.data) setStats(statsData.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!authReady) return;
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [fetchData, authReady]);

  // Admin: cargar lista de usuarios cuando entra al tab admin
  const fetchAdminUsers = useCallback(async () => {
    if (currentUser?.role !== 'admin') return;
    setAdminUsersLoading(true);
    try {
      const res = await fetch(`/api/admin/users?adminId=${currentUser.id}`);
      const data = await res.json();
      if (data.users) setAdminUsers(data.users);
    } catch {}
    finally { setAdminUsersLoading(false); }
  }, [currentUser]);

  useEffect(() => {
    if (activeTab === 'admin' && currentUser?.role === 'admin') {
      fetchAdminUsers();
    }
  }, [activeTab, fetchAdminUsers, currentUser]);

  const handleSetRole = async (targetUserId: string, newRole: string) => {
    if (!currentUser) return;
    setRoleActionStatus('Actualizando rol…');
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setRole', adminId: currentUser.id, targetUserId, newRole }),
    });
    const data = await res.json();
    if (res.ok) {
      setRoleActionStatus(`✅ Rol cambiado a "${newRole}" correctamente.`);
      fetchAdminUsers();
    } else {
      setRoleActionStatus(`❌ ${data.error}`);
    }
    setTimeout(() => setRoleActionStatus(null), 3000);
  };

  const handleDeleteUser = async (targetId: string, targetEmail: string) => {
    if (!currentUser || !confirm(`¿Eliminar al usuario ${targetEmail}? Se borrarán sus semillas.`)) return;
    await fetch(`/api/admin/users?adminId=${currentUser.id}&targetId=${targetId}`, { method: 'DELETE' });
    fetchAdminUsers();
  };

  useEffect(() => {
    if (showConsole && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs, showConsole]);

  // Auth Submit
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: authMode,
          email: emailInput,
          password: passwordInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al autenticar');

      setCurrentUser(data.user);
      localStorage.setItem('wallet_scanner_user', JSON.stringify(data.user));
      setEmailInput('');
      setPasswordInput('');
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('wallet_scanner_user');
  };

  // Loop de Escaneo
  useEffect(() => {
    isScanningRef.current = isScanning;
    let active = true;

    async function runScanLoop() {
      while (active && isScanningRef.current) {
        try {
          const res = await fetch('/api/scan-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              batchSize: 10,
              userId: currentUser?.id || 'public',
              userEmail: currentUser?.email || 'anónimo'
            }),
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

              setConsoleLogs(prev => [...prev.slice(-100), ...newItems]);
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

    return () => { active = false; };
  }, [isScanning, currentUser, fetchData]);

  // Carga masiva de semillas en lotes
  const handleUploadSeeds = async () => {
    if (!seedText.trim()) return;
    setUploading(true);
    setUploadStatus('Procesando y dividiendo lote de frases…');

    try {
      const lines = seedText.split('\n').map(l => l.trim()).filter(Boolean);
      const totalPhrases = lines.length;
      if (totalPhrases === 0) return;

      const chunkSize = 500;
      let totalInserted = 0;
      const totalChunks = Math.ceil(totalPhrases / chunkSize);

      for (let i = 0; i < totalPhrases; i += chunkSize) {
        const chunk = lines.slice(i, i + chunkSize);
        const currentChunkNum = Math.floor(i / chunkSize) + 1;
        const pct = Math.round(((i + chunk.length) / totalPhrases) * 100);

        setUploadStatus(`Cargando lote ${currentChunkNum} de ${totalChunks} (${totalInserted}/${totalPhrases} frases - ${pct}%)…`);

        const res = await fetch('/api/admin/seeds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phrases: chunk,
            userId: currentUser?.id || 'public'
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Error de servidor (${res.status})`);
        }
        totalInserted += data.added || 0;
      }

      setUploadStatus(`✅ ${totalInserted.toLocaleString()} frases mnemónicas guardadas en tu cuenta de Supabase.`);
      setSeedText('');
      fetchData();
    } catch (e: any) {
      setUploadStatus(`❌ Error: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleClearSeeds = async () => {
    if (!confirm('¿Estás seguro de borrar tus semillas personales de la base de datos?')) return;
    setUploading(true);
    try {
      const uId = currentUser?.id || 'public';
      await fetch(`/api/admin/seeds?userId=${uId}`, { method: 'DELETE' });
      setUploadStatus('🗑️ Tus semillas han sido borradas correctamente.');
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

  // ─── PANTALLA DE LOGIN OBLIGATORIA ────────────────────────────────────────
  // Si el auth ya fue verificado y no hay usuario, mostrar solo login
  if (authReady && !currentUser) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
      }}>
        <div style={{ maxWidth: 420, width: '100%' }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
              background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 30px rgba(59,130,246,0.4)'
            }}>
              <Wallet size={28} color="white" />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>WalletScanner Pro</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>Acceso privado · Solo usuarios registrados</p>
          </div>

          <div className="glass-card" style={{ padding: 28, background: 'var(--bg-secondary)' }}>
            {/* Tabs login/registro */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 24, background: 'var(--bg-primary)', borderRadius: 8, padding: 4 }}>
              {(['login', 'register'] as const).map(mode => (
                <button key={mode} onClick={() => { setAuthMode(mode); setAuthError(''); }}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 13, fontWeight: 600,
                    border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                    background: authMode === mode ? 'var(--accent-blue)' : 'transparent',
                    color: authMode === mode ? 'white' : 'var(--text-muted)',
                  }}
                >
                  {mode === 'login' ? <><LogIn size={13} style={{ display: 'inline', marginRight: 6 }} />Iniciar Sesión</> : <><Users size={13} style={{ display: 'inline', marginRight: 6 }} />Registrarse</>}
                </button>
              ))}
            </div>

            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Correo Electrónico</label>
                <input type="email" required placeholder="tu@email.com" value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  style={{
                    width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '10px 14px', color: 'var(--text-primary)', outline: 'none', fontSize: 14
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Contraseña</label>
                <input type="password" required placeholder="••••••••" value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  style={{
                    width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '10px 14px', color: 'var(--text-primary)', outline: 'none', fontSize: 14
                  }}
                />
              </div>
              {authMode === 'register' && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(59,130,246,0.08)', padding: '8px 12px', borderRadius: 6, margin: 0 }}>
                  ℹ️ Los nuevos registros siempre se crean como <strong>usuario</strong>. Solo un admin puede elevar permisos.
                </p>
              )}
              {authError && (
                <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: 10, borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)' }}>
                  ❌ {authError}
                </div>
              )}
              <button type="submit" style={{
                padding: 12, borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-green))', color: 'white', marginTop: 4
              }}>
                {authMode === 'login' ? 'Entrar al Dashboard' : 'Crear Mi Cuenta'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

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
          {/* Logo y Badge de Usuario */}
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
                WalletScanner Pro
                {currentUser ? (
                  <span style={{
                    fontSize: 10,
                    background: currentUser.role === 'admin' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                    color: currentUser.role === 'admin' ? '#ef4444' : 'var(--accent-green)',
                    padding: '2px 8px', borderRadius: 12, border: currentUser.role === 'admin' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                    fontWeight: 700, textTransform: 'uppercase'
                  }}>
                    {currentUser.role === 'admin' ? '👑 ADMIN GLOBAL' : `👤 ${currentUser.email}`}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, background: 'rgba(107, 114, 128, 0.2)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 12 }}>
                    PÚBLICO
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Escaneo Multired Cloud · ETH · BSC · BTC · SOL</div>
            </div>
          </div>

          {/* Tabs de Navegación para Admin */}
          {currentUser && currentUser.role === 'admin' && (
            <div style={{ display: 'flex', gap: 6, background: 'var(--bg-secondary)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
              <button
                onClick={() => setActiveTab('scanner')}
                style={{
                  padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                  background: activeTab === 'scanner' ? 'var(--accent-blue)' : 'transparent',
                  color: activeTab === 'scanner' ? 'white' : 'var(--text-secondary)',
                }}
              >
                Escáner
              </button>
              <button
                onClick={() => setActiveTab('admin')}
                style={{
                  padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                  background: activeTab === 'admin' ? 'var(--accent-blue)' : 'transparent',
                  color: activeTab === 'admin' ? 'white' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <UserCog size={14} /> Gestión Usuarios
              </button>
            </div>
          )}

          {/* Controles de Acción */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleLogout}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}
            >
              <LogOut size={13} /> Salir
            </button>

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
              <Terminal size={14} /> Consola
            </button>

            <button
              onClick={() => setShowSettingsModal(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', background: 'var(--bg-secondary)',
                color: 'var(--text-primary)', border: '1px solid var(--border)'
              }}
            >
              <Settings size={14} /> Cargar Frases
            </button>

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
              {isScanning ? <><Pause size={14} /> Pausar</> : <><Play size={14} /> ⚡ Iniciar Escaneo</>}
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
        {activeTab === 'admin' && currentUser?.role === 'admin' ? (
          <div className="animate-slide-in">
            {/* Panel de Gestión de Usuarios */}
            <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Gestión de Usuarios y Roles</h2>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                    Administra los accesos de la plataforma. Promueve usuarios a admin o elimínalos del sistema.
                  </p>
                </div>
                <button onClick={fetchAdminUsers} style={{
                  background: 'var(--bg-primary)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
                  color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600
                }}>
                  <RefreshCw size={13} className={adminUsersLoading ? 'animate-spin-slow' : ''} /> Refrescar
                </button>
              </div>

              {roleActionStatus && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.2)', marginBottom: 16, fontSize: 13, color: 'var(--text-primary)'
                }}>
                  {roleActionStatus}
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                {adminUsersLoading ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={24} className="animate-spin-slow" style={{ margin: '0 auto 12px' }} />
                    <div style={{ fontSize: 13 }}>Cargando usuarios...</div>
                  </div>
                ) : adminUsers.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    No hay usuarios registrados.
                  </div>
                ) : (
                  <table className="wallet-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Rol Actual</th>
                        <th>Fecha de Registro</th>
                        <th style={{ textAlign: 'right' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminUsers.map(user => (
                        <tr key={user.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 14, fontWeight: 600 }}>{user.email}</span>
                              {user.id === currentUser.id && (
                                <span style={{ fontSize: 9, background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                                  TÚ
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ID: {user.id}</span>
                          </td>
                          <td>
                            <span style={{
                              fontSize: 11,
                              background: user.role === 'admin' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              color: user.role === 'admin' ? '#ef4444' : 'var(--accent-green)',
                              padding: '2px 8px', borderRadius: 12, border: user.role === 'admin' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                              fontWeight: 700, textTransform: 'uppercase'
                            }}>
                              {user.role}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                              {new Date(user.created_at).toLocaleString()}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 8 }}>
                              {user.id !== currentUser.id && (
                                <>
                                  {user.role === 'user' ? (
                                    <button
                                      onClick={() => handleSetRole(user.id, 'admin')}
                                      style={{
                                        padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                        cursor: 'pointer', background: 'rgba(59,130,246,0.1)', color: 'var(--accent-blue)',
                                        border: '1px solid rgba(59,130,246,0.2)'
                                      }}
                                    >
                                      Hacer Admin
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleSetRole(user.id, 'user')}
                                      style={{
                                        padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                        cursor: 'pointer', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-green)',
                                        border: '1px solid rgba(16, 185, 129, 0.2)'
                                      }}
                                    >
                                      Quitar Admin
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteUser(user.id, user.email)}
                                    style={{
                                      padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                      cursor: 'pointer', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
                                      border: '1px solid rgba(239, 68, 68, 0.2)'
                                    }}
                                  >
                                    Eliminar
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* ── Banner de Admin ── */}
            {currentUser?.role === 'admin' && (
              <div style={{
                background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.15), rgba(168, 85, 247, 0.15))',
                border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 12, padding: '12px 20px',
                marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ShieldAlert color="#ef4444" size={20} />
                  <div>
                    <strong style={{ fontSize: 13, color: '#ef4444' }}>Modo Administrador Activo</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Estás viendo el global de todas las wallets y hallazgos encontrados por todos los usuarios del sistema.</div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tarjetas Estadísticas ── */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16, marginBottom: 24,
            }}>
              <StatCard
                icon={Search}
                label="Frases escaneadas"
                value={stats?.processed?.toLocaleString() ?? (loading ? '…' : '0')}
                sub={`de ${stats?.total_phrases?.toLocaleString() ?? '?'} en tu Base de Datos`}
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
                <div style={{
                  background: '#090a0f', padding: '10px 16px', borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Terminal size={15} color="var(--accent-green)" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-green)', fontFamily: 'monospace' }}>
                      terminal@{currentUser?.email || 'public'}:~# {isScanning ? 'escaneando_lotes...' : 'pausado'}
                    </span>
                  </div>
                  <button
                    onClick={() => setConsoleLogs([])}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}
                  >
                    Limpiar pantalla
                  </button>
                </div>

                <div style={{
                  background: '#050608', color: '#00ff66', fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  fontSize: 12, padding: '16px', height: 260, overflowY: 'auto', lineHeight: 1.5
                }}>
                  {consoleLogs.length === 0 ? (
                    <div style={{ color: '#4a5568' }}>
                      &gt; Presiona <strong style={{ color: '#00ff66' }}>⚡ Iniciar Escaneo</strong> arriba para comenzar a transmitir los logs en vivo…
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

            {/* ── Hallazgos con Saldo ── */}
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              {/* Header */}
              <div style={{
                padding: '16px 20px', borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Wallet size={16} color="var(--accent-green)" />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    {currentUser?.role === 'admin' ? '💰 Hallazgos Globales (Admin)' : '💰 Mis Wallets con Saldo'}
                  </span>
                  <span style={{
                    background: foundWallets.length > 0 ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.1)',
                    border: `1px solid ${foundWallets.length > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.2)'}`,
                    borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700,
                    color: foundWallets.length > 0 ? 'var(--accent-green)' : 'var(--accent-blue)',
                  }}>
                    {filteredWallets.length} encontradas
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px' }}>
                  <Search size={13} color="var(--text-muted)" />
                  <input type="text" placeholder="Buscar frase, dirección…" value={search} onChange={e => setSearch(e.target.value)}
                    style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 13, width: 200 }} />
                </div>
              </div>

              {/* Contenido */}
              <div style={{ padding: 20 }}>
                {loading ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={24} className="animate-spin-slow" style={{ margin: '0 auto 12px' }} />
                    <div style={{ fontSize: 13 }}>Cargando hallazgos…</div>
                  </div>
                ) : filteredWallets.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Wallet size={36} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Ninguna wallet con saldo encontrada aún</div>
                    <div style={{ fontSize: 12 }}>Carga tus frases y pulsa <strong>⚡ Iniciar Escaneo</strong>. Aquí aparecerán todas las wallets con fondos reales.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {filteredWallets.map((w) => {
                      const hasEth = (w.eth_balance || 0) > 0;
                      const hasBsc = (w.bsc_balance || 0) > 0;
                      const hasBtc = (w.btc_balance || 0) > 0;
                      const hasSol = (w.sol_balance || 0) > 0;
                      const hasAny = hasEth || hasBsc || hasBtc || hasSol;
                      return (
                        <div key={w.id} style={{
                          background: hasAny ? 'linear-gradient(135deg,rgba(255,230,0,0.04),rgba(16,185,129,0.06))' : 'var(--bg-primary)',
                          border: `1px solid ${hasAny ? 'rgba(255,230,0,0.25)' : 'var(--border)'}`,
                          borderRadius: 12, overflow: 'hidden',
                        }}>
                          {/* Cabecera card */}
                          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {currentUser?.role === 'admin' && (
                                <div style={{ marginBottom: 6 }}>
                                  <span style={{ fontSize: 10, background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', padding: '2px 8px', borderRadius: 10, fontWeight: 700, border: '1px solid rgba(59,130,246,0.3)' }}>
                                    👤 {w.user_email || 'anónimo'}
                                  </span>
                                </div>
                              )}
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, letterSpacing: 1 }}>FRASE SEMILLA</div>
                              <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-word', lineHeight: 1.7, background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
                                {w.phrase}
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                              {hasAny && <span style={{ fontSize: 10, fontWeight: 800, color: '#ffe600', background: 'rgba(255,230,0,0.15)', border: '1px solid rgba(255,230,0,0.3)', padding: '3px 10px', borderRadius: 20 }}>💰 CON SALDO</span>}
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(w.found_at)}</span>
                              <CopyBtn text={w.phrase} />
                            </div>
                          </div>

                          {/* Grid de cadenas */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 0 }}>
                            {w.eth_address && (
                              <div style={{ padding: '12px 16px', borderRight: '1px solid var(--border)', background: hasEth ? 'rgba(99,102,241,0.07)' : undefined }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366f1' }} />
                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1' }}>ETH · Ethereum</span>
                                  {hasEth && <span style={{ fontSize: 9, background: 'rgba(99,102,241,0.2)', color: '#818cf8', padding: '1px 5px', borderRadius: 6, fontWeight: 700 }}>✓ SALDO</span>}
                                </div>
                                <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 5, wordBreak: 'break-all' }}>{w.eth_address}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 15, fontWeight: 800, color: hasEth ? '#00ff88' : 'var(--text-muted)' }}>{formatBalance(w.eth_balance || 0)}</span>
                                  <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700 }}>ETH</span>
                                </div>
                              </div>
                            )}
                            {(w.bsc_address || w.eth_address) && (
                              <div style={{ padding: '12px 16px', borderRight: '1px solid var(--border)', background: hasBsc ? 'rgba(240,185,11,0.07)' : undefined }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f0b90b' }} />
                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#f0b90b' }}>BSC · BNB Chain</span>
                                  {hasBsc && <span style={{ fontSize: 9, background: 'rgba(240,185,11,0.2)', color: '#f0b90b', padding: '1px 5px', borderRadius: 6, fontWeight: 700 }}>✓ SALDO</span>}
                                </div>
                                <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 5, wordBreak: 'break-all' }}>{w.bsc_address || w.eth_address}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 15, fontWeight: 800, color: hasBsc ? '#f0b90b' : 'var(--text-muted)' }}>{formatBalance(w.bsc_balance || 0)}</span>
                                  <span style={{ fontSize: 11, color: '#f0b90b', fontWeight: 700 }}>BNB</span>
                                </div>
                              </div>
                            )}
                            {w.btc_address && (
                              <div style={{ padding: '12px 16px', borderRight: '1px solid var(--border)', background: hasBtc ? 'rgba(247,147,26,0.07)' : undefined }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f7931a' }} />
                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#f7931a' }}>BTC · Bitcoin</span>
                                  {hasBtc && <span style={{ fontSize: 9, background: 'rgba(247,147,26,0.2)', color: '#f7931a', padding: '1px 5px', borderRadius: 6, fontWeight: 700 }}>✓ SALDO</span>}
                                </div>
                                <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 5, wordBreak: 'break-all' }}>{w.btc_address}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 15, fontWeight: 800, color: hasBtc ? '#f7931a' : 'var(--text-muted)' }}>{formatBalance(w.btc_balance || 0)}</span>
                                  <span style={{ fontSize: 11, color: '#f7931a', fontWeight: 700 }}>BTC</span>
                                </div>
                              </div>
                            )}
                            {w.sol_address && (
                              <div style={{ padding: '12px 16px', background: hasSol ? 'rgba(168,85,247,0.07)' : undefined }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#a855f7' }} />
                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#a855f7' }}>SOL · Solana</span>
                                  {hasSol && <span style={{ fontSize: 9, background: 'rgba(168,85,247,0.2)', color: '#a855f7', padding: '1px 5px', borderRadius: 6, fontWeight: 700 }}>✓ SALDO</span>}
                                </div>
                                <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 5, wordBreak: 'break-all' }}>{w.sol_address}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 15, fontWeight: 800, color: hasSol ? '#a855f7' : 'var(--text-muted)' }}>{formatBalance(w.sol_balance || 0)}</span>
                                  <span style={{ fontSize: 11, color: '#a855f7', fontWeight: 700 }}>SOL</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>



      {/* ── Modal de Configuración & Carga de Semillas por Lotes ── */}
      {showSettingsModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div className="glass-card" style={{ maxWidth: 650, width: '100%', padding: 28, background: 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Settings size={20} color="var(--accent-blue)" />
                <h3 style={{ margin: 0, fontSize: 18 }}>Cargar Frases Semilla Personales</h3>
              </div>
              <button onClick={() => setShowSettingsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0, marginBottom: 16 }}>
              Pega tus frases mnemónicas (una por línea). Se guardarán ligadas a tu cuenta (<code>{currentUser?.email || 'público'}</code>) en Supabase.
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
                <Trash2 size={14} /> Borrar Mis Semillas
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
