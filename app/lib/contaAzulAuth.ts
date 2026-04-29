/**
 * contaAzulAuth.ts
 * Biblioteca de autenticação OAuth 2.0 para a API Conta Azul.
 *
 * Fluxo:
 *  1. access_token expira em 1 hora (expires_in: 3600)
 *  2. refresh_token MUDA A CADA RENOVAÇÃO — sempre salvar o novo!
 *  3. Tokens são persistidos no Upstash KV via REST API
 *
 * Base URL OAuth: https://auth.contaazul.com/oauth2/token
 * Base URL API:   https://api-v2.contaazul.com/v1/
 *
 * Rate limits: 600 req/min · 10 req/s por conta ERP
 */

// Upstash Redis via REST API (sem dependência de @vercel/kv)
function kvBase()  { return process.env.KV_REST_API_URL   || ''; }
function kvToken() { return process.env.KV_REST_API_TOKEN || ''; }

async function kvSet(key: string, value: string): Promise<void> {
  await fetch(`${kvBase()}/set/${encodeURIComponent(key)}`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${kvToken()}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify([value]),
  });
}

async function kvGet(key: string): Promise<string | null> {
  const res = await fetch(`${kvBase()}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${kvToken()}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.result ?? null;
}

async function kvDel(...keys: string[]): Promise<void> {
  for (const key of keys) {
    await fetch(`${kvBase()}/del/${encodeURIComponent(key)}`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${kvToken()}` },
    });
  }
}

export const CA_AUTH_URL  = 'https://auth.contaazul.com/oauth2/token';
export const CA_API_BASE  = 'https://api-v2.contaazul.com/v1';
export const CA_LOGIN_URL = 'https://auth.contaazul.com/login';

/** Chaves de armazenamento no Upstash KV */
const KV_ACCESS_TOKEN  = 'ca:access_token';
const KV_REFRESH_TOKEN = 'ca:refresh_token';
const KV_EXPIRES_AT    = 'ca:expires_at';   // timestamp Unix em ms

/** Quantos ms antes do vencimento renovar o token (5 minutos) */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export interface ContaAzulTokens {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;  // segundos
  token_type:    string;
}

export interface StoredTokens {
  accessToken:  string;
  refreshToken: string;
  expiresAt:    number; // timestamp Unix em ms
}

// ── Persistência no KV ────────────────────────────────────────────────────────

export async function saveContaAzulTokens(tokens: ContaAzulTokens): Promise<void> {
  const expiresAt = Date.now() + tokens.expires_in * 1000;
  await Promise.all([
    kvSet(KV_ACCESS_TOKEN,  tokens.access_token),
    kvSet(KV_REFRESH_TOKEN, tokens.refresh_token),
    kvSet(KV_EXPIRES_AT,    String(expiresAt)),
  ]);
}

export async function getStoredTokens(): Promise<StoredTokens | null> {
  const [accessToken, refreshToken, expiresAtStr] = await Promise.all([
    kvGet(KV_ACCESS_TOKEN),
    kvGet(KV_REFRESH_TOKEN),
    kvGet(KV_EXPIRES_AT),
  ]);

  if (!accessToken || !refreshToken || !expiresAtStr) return null;

  return {
    accessToken,
    refreshToken,
    expiresAt: parseInt(expiresAtStr, 10),
  };
}

export async function clearContaAzulTokens(): Promise<void> {
  await kvDel(KV_ACCESS_TOKEN, KV_REFRESH_TOKEN, KV_EXPIRES_AT);
}

// ── Troca de tokens ───────────────────────────────────────────────────────────

function getBasicAuth(): string {
  const basicAuth = process.env.CONTAAZUL_BASIC_AUTH;
  if (!basicAuth) {
    const clientId     = process.env.CONTAAZUL_CLIENT_ID     || '';
    const clientSecret = process.env.CONTAAZUL_CLIENT_SECRET || '';
    return Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  }
  return basicAuth;
}

/** Troca authorization_code por access_token + refresh_token (Setup inicial) */
export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<ContaAzulTokens> {
  const body = new URLSearchParams({
    grant_type:   'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(CA_AUTH_URL, {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${getBasicAuth()}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Conta Azul code exchange failed (${response.status}): ${errorText}`);
  }

  const tokens: ContaAzulTokens = await response.json();
  await saveContaAzulTokens(tokens);
  return tokens;
}

/** Renova o access_token usando o refresh_token.
 *  ⚠️ O refresh_token muda a cada renovação — sempre persistir o novo! */
export async function refreshContaAzulToken(currentRefreshToken: string): Promise<ContaAzulTokens> {
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: currentRefreshToken,
  });

  const response = await fetch(CA_AUTH_URL, {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${getBasicAuth()}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Conta Azul token refresh failed (${response.status}): ${errorText}`);
  }

  const tokens: ContaAzulTokens = await response.json();
  // CRÍTICO: sempre salvar o novo refresh_token pois ele muda a cada renovação
  await saveContaAzulTokens(tokens);
  return tokens;
}

// ── Ponto de entrada principal ────────────────────────────────────────────────

/**
 * Retorna um access_token válido.
 * - Se o token atual ainda está válido (com buffer de 5min), retorna ele.
 * - Se está próximo do vencimento, renova automaticamente.
 * - Lança erro se não há tokens armazenados.
 */
export async function getContaAzulToken(): Promise<string> {
  const stored = await getStoredTokens();

  if (!stored) {
    throw new Error('Conta Azul não conectado. Acesse /conta-azul/setup para configurar.');
  }

  const isExpired = Date.now() >= stored.expiresAt - REFRESH_BUFFER_MS;

  if (!isExpired) {
    return stored.accessToken;
  }

  // Renovar automaticamente
  try {
    const newTokens = await refreshContaAzulToken(stored.refreshToken);
    return newTokens.access_token;
  } catch (err) {
    // Se o refresh_token também expirou, sinalizar reconexão
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('invalid_grant') || msg.includes('401')) {
      await clearContaAzulTokens();
      throw new Error('Conta Azul: sessão expirada. Acesse /conta-azul/setup para reconectar.');
    }
    throw err;
  }
}

/** Verifica se há uma conexão ativa e retorna o status */
export async function getContaAzulStatus(): Promise<{
  connected: boolean;
  expiresAt: number | null;
  expiresInMinutes: number | null;
}> {
  const stored = await getStoredTokens();
  if (!stored) {
    return { connected: false, expiresAt: null, expiresInMinutes: null };
  }

  const expiresInMs      = stored.expiresAt - Date.now();
  const expiresInMinutes = Math.round(expiresInMs / 60000);

  return {
    connected:        expiresInMinutes > -60, // considera conectado até 60min após expirar
    expiresAt:        stored.expiresAt,
    expiresInMinutes: expiresInMinutes,
  };
}

/** Monta a URL de autorização OAuth para redirecionar o usuário */
export function getAuthorizationUrl(redirectUri: string, state = 'radexperts'): string {
  const clientId = process.env.CONTAAZUL_CLIENT_ID || '';
  const params   = new URLSearchParams({
    response_type: 'code',
    client_id:     clientId,
    redirect_uri:  redirectUri,
    state,
    scope:         'openid profile aws.cognito.signin.user.admin',
  });
  return `${CA_LOGIN_URL}?${params.toString()}`;
}

/** Salva um refresh_token diretamente (obtido via extensão Chrome ou outro método) */
export async function saveRefreshToken(refreshToken: string): Promise<void> {
  // Tenta renovar imediatamente para validar o token e obter um access_token fresco
  await refreshContaAzulToken(refreshToken);
}
