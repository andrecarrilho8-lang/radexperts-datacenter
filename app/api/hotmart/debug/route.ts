import { NextResponse } from 'next/server';
import https from 'https';

export const dynamic         = 'force-dynamic';
export const runtime         = 'nodejs';
export const preferredRegion = 'gru1';

const HOTMART_AUTH_URL = 'api-sec-vlc.hotmart.com';
const HOTMART_API_HOST = 'developers.hotmart.com';

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
  const result = await httpsPost(HOTMART_AUTH_URL, authPath, { 'Authorization': authHeader });
  const data = JSON.parse(result.body);
  if (!data?.access_token) throw new Error('No token');
  return data.access_token as string;
}

async function tryGet(token: string, path: string) {
  try {
    const r = await httpsGet(HOTMART_API_HOST, path, { 'Authorization': `Bearer ${token}` });
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

    // ── Mode 1: inspect commission endpoints for a specific transaction ──────
    if (transaction) {
      const results = await Promise.all([
        // Correct param name is "transaction" not "transaction_id" (per docs)
        tryGet(token, `/payments/api/v1/sales/commissions?transaction=${transaction}`),
        tryGet(token, `/payments/api/v1/sales/commissions?transaction=${transaction}&commission_as=PRODUCER`),
        tryGet(token, `/payments/api/v1/sales/commissions?transaction=${transaction}&commission_as=COPRODUCER`),
        tryGet(token, `/payments/api/v1/sales/users?transaction=${transaction}`),
        tryGet(token, `/payments/api/v1/sales/participants?transaction=${transaction}`),
        tryGet(token, `/payments/api/v1/sales/history?transaction=${transaction}&max_results=1`),
        tryGet(token, `/payments/api/v1/sales/price/details?transaction=${transaction}`),
      ]);
      return NextResponse.json({ mode: 'commission_detail', transaction, results });
    }

    // ── Mode 2: general stats + commission samples ───────────────────────────
    const now  = Date.now();
    const past = now - (days * 24 * 60 * 60 * 1000);

    const salesResp = await tryGet(token, `/payments/api/v1/sales/history?start_date=${past}&end_date=${now}&max_results=50`);
    const items: any[] = salesResp.body?.items || [];

    const statusCount: Record<string, number> = {};
    items.forEach((s: any) => {
      const st = s.purchase?.status || 'UNKNOWN';
      statusCount[st] = (statusCount[st] || 0) + 1;
    });

    // Scan all items for any "commission" field at any level
    const withCommission = items.find((s: any) =>
      s.commission != null ||
      s.purchase?.commission != null ||
      s.purchase?.commission_value != null
    );

    const approved = items.filter((s: any) => ['APPROVED','COMPLETE'].includes(s.purchase?.status || ''));

    // Try fetching commissions for the most recent approved sale
    let commissionSample = null;
    if (approved[0]?.purchase?.transaction) {
      const tx = approved[0].purchase.transaction;
      commissionSample = await tryGet(token, `/payments/api/v1/sales/commissions?transaction=${tx}`);
    }

    return NextResponse.json({
      period_days: days,
      total_items: items.length,
      status_breakdown: statusCount,
      item_top_level_keys:    approved[0] ? Object.keys(approved[0]) : [],
      purchase_keys:          approved[0] ? Object.keys(approved[0].purchase || {}) : [],
      item_with_commission:   withCommission || 'none found',
      commission_api_sample:  commissionSample,
      hint: 'Add ?transaction=HPXXXXXXXX to inspect a specific sale',
    });

  } catch (e: any) {
    return NextResponse.json({ crashed: true, error: e.message });
  }
}
