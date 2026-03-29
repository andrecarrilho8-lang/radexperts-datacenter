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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days        = parseInt(searchParams.get('days') || '30');
  const transaction = searchParams.get('transaction'); // e.g. HP3970815852

  try {
    const clientId   = process.env.HOTMART_CLIENT_ID     || '';
    const clientSecret = process.env.HOTMART_CLIENT_SECRET || '';
    const basicToken = process.env.HOTMART_BASIC_TOKEN    || '';
    const token = await getToken(clientId, clientSecret, basicToken);

    // ── Mode 1: fetch price details for a specific transaction ──────────────
    if (transaction) {
      const paths = [
        `/payments/api/v1/sales/price/details?transaction=${transaction}`,
        `/payments/api/v1/sales/commissions?transaction_id=${transaction}`,
        `/payments/api/v1/sales/participants?transaction_id=${transaction}`,
      ];
      const results = await Promise.all(paths.map(async (p) => {
        try {
          const r = await httpsGet(HOTMART_API_HOST, p, { 'Authorization': `Bearer ${token}` });
          let body: any;
          try { body = JSON.parse(r.body); } catch { body = r.body; }
          return { path: p, status: r.status, body };
        } catch (e: any) {
          return { path: p, status: 0, error: e.message };
        }
      }));
      return NextResponse.json({ mode: 'transaction_detail', transaction, results });
    }

    // ── Mode 2: general sales stats ─────────────────────────────────────────
    const now  = Date.now();
    const past = now - (days * 24 * 60 * 60 * 1000);

    const salesPath = `/payments/api/v1/sales/history?start_date=${past}&end_date=${now}&max_results=500`;
    const salesResult = await httpsGet(HOTMART_API_HOST, salesPath, { 'Authorization': `Bearer ${token}` });

    let salesData: any;
    try { salesData = JSON.parse(salesResult.body); } catch { return NextResponse.json({ step: 'sales_parse_fail' }); }

    const items: any[] = salesData?.items || [];

    const statusCount: Record<string, number> = {};
    items.forEach((s: any) => {
      const st = s.purchase?.status || 'UNKNOWN';
      statusCount[st] = (statusCount[st] || 0) + 1;
    });

    // Find samples: one without co-producer, one with commission field
    const approvedSample    = items.find((s: any) => ['APPROVED','COMPLETE'].includes(s.purchase?.status || ''));
    const withCommission    = items.find((s: any) => s.purchase?.commission != null || s.commission != null);
    const installmentSample = items.find((s: any) =>
      ['APPROVED','COMPLETE'].includes(s.purchase?.status || '') &&
      (s.purchase?.payment?.installments_number || 1) > 1
    );

    const approvedCount = (statusCount['APPROVED'] || 0) + (statusCount['COMPLETE'] || 0);

    return NextResponse.json({
      period_days:      days,
      total_api_items:  items.length,
      status_breakdown: statusCount,
      approved_complete_count: approvedCount,
      hint: 'To inspect a specific transaction, add ?transaction=HPXXXXXXXX to the URL',
      // Field exploration — shows ALL top-level keys of items (to find commission)
      item_top_level_keys: approvedSample ? Object.keys(approvedSample) : [],
      purchase_keys:       approvedSample ? Object.keys(approvedSample.purchase || {}) : [],
      // Samples
      sample_with_commission: withCommission || null,
      raw_approved_sample:    approvedSample || null,
      raw_installment_sample: installmentSample || null,
    });

  } catch (e: any) {
    return NextResponse.json({ crashed: true, error: e.message });
  }
}
