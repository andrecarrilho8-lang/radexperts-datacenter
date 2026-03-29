import { NextResponse } from 'next/server';
import https from 'https';

export const dynamic         = 'force-dynamic';
export const runtime         = 'nodejs';
export const preferredRegion = 'gru1';

function httpsGet(hostname: string, path: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

function httpsPost(hostname: string, path: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function getToken(clientId: string, clientSecret: string, basicToken: string) {
  const authHeader = basicToken.startsWith('Basic ') ? basicToken : `Basic ${basicToken}`;
  const authPath = `/security/oauth/token?grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`;
  const result = await httpsPost('api-sec-vlc.hotmart.com', authPath, { 'Authorization': authHeader });
  const data = JSON.parse(result.body);
  if (!data?.access_token) throw new Error('No token');
  return data.access_token as string;
}

async function tryGet(token: string, hostname: string, path: string) {
  try {
    const r = await httpsGet(hostname, path, { 'Authorization': `Bearer ${token}` });
    let body: any;
    try { body = JSON.parse(r.body); } catch { body = r.body; }
    return { path, status: r.status, body };
  } catch (e: any) {
    return { path, status: 0, error: e.message };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days        = parseInt(searchParams.get('days') || '30');
  const transaction = searchParams.get('transaction');

  try {
    const clientId     = process.env.HOTMART_CLIENT_ID     || '';
    const clientSecret = process.env.HOTMART_CLIENT_SECRET || '';
    const basicToken   = process.env.HOTMART_BASIC_TOKEN   || '';
    const token        = await getToken(clientId, clientSecret, basicToken);

    const HOTMART_API_HOST = 'developers.hotmart.com';

    // ── Mode 1: inspect a specific transaction in full detail ──────────────
    if (transaction) {
      const results = await Promise.all([
        tryGet(token, HOTMART_API_HOST, `/payments/api/v1/sales/commissions?transaction=${transaction}`),
        tryGet(token, HOTMART_API_HOST, `/payments/api/v1/sales/commissions?transaction=${transaction}&commission_as=PRODUCER`),
        tryGet(token, HOTMART_API_HOST, `/payments/api/v1/sales/commissions?transaction=${transaction}&commission_as=COPRODUCER`),
        tryGet(token, HOTMART_API_HOST, `/payments/api/v1/sales/users?transaction=${transaction}`),
        tryGet(token, HOTMART_API_HOST, `/payments/api/v1/sales/participants?transaction=${transaction}`),
        tryGet(token, HOTMART_API_HOST, `/payments/api/v1/sales/history?transaction=${transaction}&max_results=1`),
        tryGet(token, HOTMART_API_HOST, `/payments/api/v1/sales/price/details?transaction=${transaction}`),
      ]);
      return NextResponse.json({ mode: 'commission_detail', transaction, results });
    }

    // ── Mode 2: dump ALL fields of recent LATAM (non-BRL) sales ─────────────
    const now  = Date.now();
    const past = now - (days * 24 * 60 * 60 * 1000);

    const salesResp = await tryGet(token, HOTMART_API_HOST, `/payments/api/v1/sales/history?start_date=${past}&end_date=${now}&max_results=100`);
    const items: any[] = salesResp.body?.items || [];

    // Find non-BRL approved sales
    const latamSales = items.filter((s: any) =>
      ['APPROVED', 'COMPLETE'].includes(s.purchase?.status || '') &&
      (s.purchase?.price?.currency_code || 'BRL') !== 'BRL'
    ).slice(0, 5);

    // IMPORTANT: Dump ALL keys and nested fields of each sale to find "valor recebido convertido"
    const latamDump = latamSales.map((s: any) => ({
      transaction:   s.purchase?.transaction,
      currency:      s.purchase?.price?.currency_code,
      buyer:         s.buyer?.name,
      // All price fields
      price_all:     s.purchase?.price,
      // All commission fields
      commission_all: s.purchase?.commission,
      // All hotmart_fee fields
      hotmart_fee:   s.purchase?.hotmart_fee,
      // All top-level purchase keys
      purchase_keys: Object.keys(s.purchase || {}),
      // Raw full purchase for inspection
      purchase_raw:  s.purchase,
    }));

    // Also check the commissions API for first LATAM sale
    let commissionForLatam = null;
    if (latamSales[0]?.purchase?.transaction) {
      const tx = latamSales[0].purchase.transaction;
      commissionForLatam = await tryGet(token, HOTMART_API_HOST, `/payments/api/v1/sales/commissions?transaction=${tx}`);
    }

    return NextResponse.json({
      mode: 'latam_field_dump',
      period_days: days,
      latam_count: latamSales.length,
      latam_sales_dump: latamDump,
      commission_for_first_latam: commissionForLatam,
      hint: 'Looking for "valor que voce recebeu convertido" equivalent API field',
    });

  } catch (e: any) {
    return NextResponse.json({ crashed: true, error: e.message });
  }
}
