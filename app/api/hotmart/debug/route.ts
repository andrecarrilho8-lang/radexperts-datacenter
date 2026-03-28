import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HOTMART_AUTH_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token';
const HOTMART_API_BASE = 'https://developers.hotmart.com/payments/api/v1';

export async function GET() {
  try {
    const clientId     = process.env.HOTMART_CLIENT_ID     || '';
    const clientSecret = process.env.HOTMART_CLIENT_SECRET || '';
    const basicToken   = process.env.HOTMART_BASIC_TOKEN   || '';
    const authHeader   = basicToken.startsWith('Basic ') ? basicToken : `Basic ${basicToken}`;

    // 1. Auth
    const authResp = await fetch(
      `${HOTMART_AUTH_URL}?grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': authHeader }, cache: 'no-store' }
    );
    const authData = await authResp.json() as any;
    if (!authData.access_token) return NextResponse.json({ step: 'auth_failed', raw: authData });
    const token = authData.access_token as string;

    const headers = { 'Authorization': `Bearer ${token}` };
    const now  = Date.now();
    const past = now - (7 * 24 * 60 * 60 * 1000);

    // 2. Tenta /sales/history simples
    const url1 = `${HOTMART_API_BASE}/sales/history?start_date=${past}&end_date=${now}`;
    const r1   = await fetch(url1, { headers, cache: 'no-store' });
    const d1   = await r1.text();

    // 3. Tenta /sales/summary
    const url2 = `${HOTMART_API_BASE}/sales/summary?start_date=${past}&end_date=${now}`;
    const r2   = await fetch(url2, { headers, cache: 'no-store' });
    const d2   = await r2.text();

    // 4. Tenta sem datas (últimas vendas)
    const url3 = `${HOTMART_API_BASE}/sales/history`;
    const r3   = await fetch(url3, { headers, cache: 'no-store' });
    const d3   = await r3.text();

    return NextResponse.json({
      token_ok: true,
      test1_with_dates:    { status: r1.status, url: url1, body: d1.substring(0, 500) },
      test2_summary:       { status: r2.status, url: url2, body: d2.substring(0, 500) },
      test3_no_dates:      { status: r3.status, url: url3, body: d3.substring(0, 500) },
    });

  } catch (e: any) {
    return NextResponse.json({ crashed: true, error: e.message });
  }
}
