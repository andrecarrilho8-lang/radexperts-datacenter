/**
 * app/api/conta-azul/auth/route.ts
 * Gerencia o fluxo OAuth 2.0 da Conta Azul:
 *   GET  → retorna a URL de autorização + status de conexão
 *   POST → troca code por tokens OU salva refresh_token diretamente
 *   DELETE → desconecta (limpa tokens do KV)
 */

import { NextResponse } from 'next/server';
import {
  exchangeCodeForTokens,
  saveRefreshToken,
  clearContaAzulTokens,
  getContaAzulStatus,
  getAuthorizationUrl,
} from '@/app/lib/contaAzulAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// DEVE BATER exatamente com o que está cadastrado no portal dev da Conta Azul
const REDIRECT_URI = process.env.CONTAAZUL_REDIRECT_URI || 'https://radexperts-datacenter.vercel.app/conta-azul/setup';

// ── GET — retorna URL de autorização + status atual ─────────────────────────
export async function GET() {
  try {
    const status = await getContaAzulStatus();
    const authUrl = getAuthorizationUrl(REDIRECT_URI);

    return NextResponse.json({
      authUrl,
      redirectUri: REDIRECT_URI,
      ...status,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── POST — conectar com code ou refresh_token ────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { code, refresh_token } = body;

    if (code) {
      // Etapa 2 do OAuth: trocar authorization_code por tokens
      const tokens = await exchangeCodeForTokens(code, REDIRECT_URI);
      const status = await getContaAzulStatus();
      return NextResponse.json({
        success: true,
        method:  'code_exchange',
        message: 'Conta Azul conectado com sucesso!',
        ...status,
      });
    }

    if (refresh_token) {
      // Conexão direta via refresh_token (obtido pela extensão Chrome)
      await saveRefreshToken(refresh_token);
      const status = await getContaAzulStatus();
      return NextResponse.json({
        success: true,
        method:  'refresh_token_direct',
        message: 'Conta Azul conectado com sucesso via refresh token!',
        ...status,
      });
    }

    return NextResponse.json(
      { error: 'Envie { code } ou { refresh_token } no body da requisição.' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[conta-azul/auth] POST error:', error.message);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// ── DELETE — desconectar ─────────────────────────────────────────────────────
export async function DELETE() {
  try {
    await clearContaAzulTokens();
    return NextResponse.json({ success: true, message: 'Conta Azul desconectado.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
