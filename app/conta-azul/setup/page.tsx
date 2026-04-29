'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const GOLD   = '#E8B14F';
const NAVY   = '#001a35';
const SILVER = '#A8B2C0';
const GREEN  = '#22c55e';
const RED    = '#ef4444';

interface Status {
  connected:        boolean;
  expiresAt:        number | null;
  expiresInMinutes: number | null;
}

// ── Inner component (needs useSearchParams) ───────────────────────────────────
function SetupContent() {
  const searchParams = useSearchParams();

  const [status,       setStatus]       = useState<Status | null>(null);
  const [authUrl,      setAuthUrl]      = useState('');
  const [code,         setCode]         = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [loading,      setLoading]      = useState(false);
  const [msg,          setMsg]          = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab,    setActiveTab]    = useState<'code' | 'token'>('code');
  const [autoConnecting, setAutoConnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res  = await fetch('/api/conta-azul/auth');
      const data = await res.json();
      setStatus({ connected: data.connected, expiresAt: data.expiresAt, expiresInMinutes: data.expiresInMinutes });
      setAuthUrl(data.authUrl || '');
    } catch {
      setStatus({ connected: false, expiresAt: null, expiresInMinutes: null });
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30_000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  // ── Auto-connect se há ?code= na URL (callback OAuth) ─────────────────────
  useEffect(() => {
    const codeFromUrl = searchParams.get('code');
    if (!codeFromUrl) return;

    // Limpar o code da URL sem recarregar a página
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);

    setAutoConnecting(true);
    setMsg({ type: 'success', text: '🔄 Código de autorização detectado! Conectando automaticamente...' });

    fetch('/api/conta-azul/auth', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code: codeFromUrl }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setMsg({ type: 'success', text: '✅ ' + (data.message || 'Conta Azul conectado com sucesso!') });
          loadStatus();
        } else {
          setMsg({ type: 'error', text: '❌ ' + (data.error || 'Falha ao conectar') });
        }
      })
      .catch(err => {
        setMsg({ type: 'error', text: '❌ Erro de rede: ' + err.message });
      })
      .finally(() => {
        setAutoConnecting(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async (payload: Record<string, string>) => {
    setLoading(true);
    setMsg(null);
    try {
      const res  = await fetch('/api/conta-azul/auth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao conectar');
      setMsg({ type: 'success', text: data.message || 'Conectado com sucesso!' });
      setCode('');
      setRefreshToken('');
      await loadStatus();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Desconectar a Conta Azul? Os tokens serão removidos.')) return;
    setLoading(true);
    try {
      await fetch('/api/conta-azul/auth', { method: 'DELETE' });
      setMsg({ type: 'success', text: 'Desconectado com sucesso.' });
      await loadStatus();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const expiresLabel = () => {
    if (!status?.expiresInMinutes) return '';
    const m = status.expiresInMinutes;
    if (m > 60)  return `Expira em ${Math.floor(m / 60)}h ${m % 60}min`;
    if (m > 0)   return `Expira em ${m}min`;
    return 'Expirado — renovação automática pendente';
  };

  const cardStyle: React.CSSProperties = {
    background:   'rgba(255,255,255,0.03)',
    border:       '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding:      28,
    backdropFilter: 'blur(12px)',
  };

  return (
    <main style={{ paddingTop: 120, minHeight: '100vh', maxWidth: 760, margin: '0 auto', padding: '120px 24px 60px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #0066CC, #004499)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,102,204,0.4)',
          }}>
            <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 22 }}>cloud_sync</span>
          </div>
          <div>
            <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 900, margin: 0 }}>Configurar Conta Azul</h1>
            <p style={{ color: SILVER, fontSize: 11, margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
              Integração ERP — OAuth 2.0
            </p>
          </div>
        </div>
      </div>

      {/* Auto-connecting spinner */}
      {autoConnecting && (
        <div style={{
          ...cardStyle, marginBottom: 20, padding: '20px 24px',
          borderColor: 'rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.06)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span className="material-symbols-outlined" style={{ color: '#3b82f6', fontSize: 24, animation: 'spin 1s linear infinite' }}>sync</span>
          <p style={{ margin: 0, color: '#3b82f6', fontWeight: 700, fontSize: 13 }}>
            Conectando automaticamente via código OAuth...
          </p>
        </div>
      )}

      {/* Status Card */}
      <div style={{ ...cardStyle, marginBottom: 20, borderColor: status?.connected ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: status?.connected ? GREEN : RED,
              boxShadow: `0 0 8px ${status?.connected ? GREEN : RED}`,
            }} />
            <div>
              <p style={{ color: '#fff', fontWeight: 900, fontSize: 14, margin: 0 }}>
                {status === null ? 'Verificando...' : status.connected ? '✅ Conectado ao Conta Azul' : '🔴 Desconectado'}
              </p>
              {status?.connected && (
                <p style={{ color: SILVER, fontSize: 11, margin: 0, marginTop: 2 }}>{expiresLabel()}</p>
              )}
            </div>
          </div>
          {status?.connected && (
            <button
              onClick={disconnect}
              disabled={loading}
              style={{
                padding: '8px 16px', borderRadius: 10, border: `1px solid rgba(239,68,68,0.3)`,
                background: 'rgba(239,68,68,0.1)', color: RED, cursor: 'pointer',
                fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
              Desconectar
            </button>
          )}
        </div>
      </div>

      {/* Mensagem de feedback */}
      {msg && (
        <div style={{
          ...cardStyle, marginBottom: 20, padding: 16,
          borderColor: msg.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
          background:  msg.type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
        }}>
          <p style={{ margin: 0, color: msg.type === 'success' ? GREEN : RED, fontWeight: 700, fontSize: 13 }}>
            {msg.text}
          </p>
        </div>
      )}

      {/* Guia de conexão */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h2 style={{ color: GOLD, fontSize: 13, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 16px' }}>
          🔗 Como Conectar — Fluxo Automático
        </h2>

        {/* Destaque: URL que deve estar no portal */}
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: 'rgba(0,102,204,0.1)', border: '1px solid rgba(0,102,204,0.3)' }}>
          <p style={{ margin: '0 0 6px', color: '#60a5fa', fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            📌 URL de Redirecionamento — cadastrar no portal dev da Conta Azul
          </p>
          <code style={{ display: 'block', color: '#fff', fontSize: 12, fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: 8, wordBreak: 'break-all' }}>
            https://datacenter.radexperts.com.br/conta-azul/setup
          </code>
          <p style={{ margin: '8px 0 0', color: SILVER, fontSize: 11 }}>
            Acesse <a href="https://developers.contaazul.com/apps" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>developers.contaazul.com/apps</a> → edite a aplicação → cole essa URL no campo "URL de redirecionamento"
          </p>
        </div>

        <ol style={{ margin: 0, padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            'Cadastre a URL acima no portal de desenvolvedores da Conta Azul (campo "URL de redirecionamento")',
            'Clique em "Abrir Tela de Autorização" abaixo',
            'Faça login com as credenciais do ERP Conta Azul',
            'Você será redirecionado automaticamente de volta para esta página',
            'A conexão será estabelecida automaticamente! ✨',
          ].map((step, i) => (
            <li key={i} style={{ color: SILVER, fontSize: 12, lineHeight: 1.6, fontWeight: 600 }}>
              <span style={{ color: GOLD, fontWeight: 900 }}>{i + 1}.</span> {step}
            </li>
          ))}
        </ol>

        {authUrl && (
          <a
            href={authUrl}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              marginTop: 16, padding: '12px 20px', borderRadius: 12,
              background: 'linear-gradient(135deg, #0066CC, #004499)',
              color: '#fff', textDecoration: 'none',
              fontWeight: 900, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase',
              boxShadow: '0 4px 16px rgba(0,102,204,0.4)',
            }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
            Abrir Tela de Autorização
          </a>
        )}
      </div>

      {/* Tabs: code manual ou refresh_token */}
      <div style={{ ...cardStyle }}>
        <p style={{ margin: '0 0 12px', color: SILVER, fontSize: 11, fontWeight: 700 }}>
          🔧 Conexão manual (alternativa, caso o fluxo automático falhe)
        </p>
        {/* Tab selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 4 }}>
          {(['code', 'token'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 9, border: 'none',
                cursor: 'pointer', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
                background: activeTab === tab ? GOLD : 'transparent',
                color:      activeTab === tab ? NAVY : SILVER,
                transition: 'all 0.2s',
              }}>
              {tab === 'code' ? '🔑 Código de autorização' : '🔄 Refresh Token'}
            </button>
          ))}
        </div>

        {activeTab === 'code' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ color: SILVER, fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Cole o "code" da URL de redirecionamento manualmente
            </label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Ex: 3c211b66-151f-431c-85f0-79a70838909c"
              style={{
                padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 12, fontFamily: 'monospace',
                outline: 'none', width: '100%', boxSizing: 'border-box',
              }}
            />
            <p style={{ margin: 0, color: 'rgba(168,178,192,0.6)', fontSize: 10 }}>
              ⚠️ O código expira em 3 minutos após a autorização.
            </p>
            <button
              onClick={() => connect({ code })}
              disabled={!code.trim() || loading}
              style={{
                padding: '13px 0', borderRadius: 12, border: 'none', cursor: code.trim() ? 'pointer' : 'not-allowed',
                background: code.trim() ? `linear-gradient(135deg, ${GOLD}, #c8902a)` : 'rgba(255,255,255,0.06)',
                color: code.trim() ? NAVY : SILVER,
                fontWeight: 900, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
                width: '100%', opacity: loading ? 0.7 : 1,
              }}>
              {loading ? 'Conectando...' : '✅ Conectar com Code'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ color: SILVER, fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Cole o Refresh Token (obtido pela extensão Chrome)
            </label>
            <textarea
              value={refreshToken}
              onChange={e => setRefreshToken(e.target.value)}
              placeholder="eyJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwiYWxnIjoiUlNBLU9BRVAifQ..."
              rows={5}
              style={{
                padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 11, fontFamily: 'monospace',
                outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical',
              }}
            />
            <button
              onClick={() => connect({ refresh_token: refreshToken })}
              disabled={!refreshToken.trim() || loading}
              style={{
                padding: '13px 0', borderRadius: 12, border: 'none', cursor: refreshToken.trim() ? 'pointer' : 'not-allowed',
                background: refreshToken.trim() ? `linear-gradient(135deg, ${GOLD}, #c8902a)` : 'rgba(255,255,255,0.06)',
                color: refreshToken.trim() ? NAVY : SILVER,
                fontWeight: 900, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
                width: '100%', opacity: loading ? 0.7 : 1,
              }}>
              {loading ? 'Conectando...' : '✅ Conectar com Refresh Token'}
            </button>
          </div>
        )}
      </div>

      {/* Info técnica */}
      <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ margin: 0, color: 'rgba(168,178,192,0.5)', fontSize: 10, lineHeight: 1.8 }}>
          🔒 Os tokens são armazenados com segurança no Upstash Redis e renovados automaticamente antes de expirar.<br />
          ⏱ access_token expira em 1 hora. refresh_token é renovado a cada ciclo e sempre atualizado.<br />
          ⚡ Rate limit: 600 req/min · 10 req/s por conta ERP.
        </p>
      </div>
    </main>
  );
}

// ── Page wrapper com Suspense (necessário para useSearchParams) ───────────────
export default function ContaAzulSetupPage() {
  return (
    <Suspense fallback={
      <main style={{ paddingTop: 120, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="material-symbols-outlined" style={{ color: '#E8B14F', fontSize: 32 }}>sync</span>
      </main>
    }>
      <SetupContent />
    </Suspense>
  );
}
