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
  if (!data?.access_token) throw new Error('No token: ' + result.body);
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
  const mode        = searchParams.get('mode') || 'tracking'; // 'tracking' | 'transaction' | 'latam'

  try {
    const clientId     = process.env.HOTMART_CLIENT_ID     || '';
    const clientSecret = process.env.HOTMART_CLIENT_SECRET || '';
    const basicToken   = process.env.HOTMART_BASIC_TOKEN   || '';
    const token        = await getToken(clientId, clientSecret, basicToken);

    const HOST = 'developers.hotmart.com';

    // ── Mode: inspect a specific transaction ─────────────────────────────────
    if (transaction) {
      const results = await Promise.all([
        tryGet(token, HOST, `/payments/api/v1/sales/history?transaction=${transaction}&max_results=1`),
        tryGet(token, HOST, `/payments/api/v1/sales/commissions?transaction=${transaction}`),
        tryGet(token, HOST, `/payments/api/v1/sales/price/details?transaction=${transaction}`),
      ]);
      return NextResponse.json({ mode: 'transaction_detail', transaction, results });
    }

    // ── Main mode: dump tracking fields of recent BRL approved sales ─────────
    const now  = Date.now();
    const past = now - (days * 24 * 60 * 60 * 1000);

    const salesResp = await tryGet(token, HOST,
      `/payments/api/v1/sales/history?start_date=${past}&end_date=${now}&max_results=500&commission_as=PRODUCER`
    );
    const items: any[] = salesResp.body?.items || [];

    const APPROVED = new Set(['APPROVED', 'COMPLETE', 'CONFIRMED', 'PRODUCER_CONFIRMED']);
    const approved = items.filter((s: any) => APPROVED.has(s.purchase?.status || ''));

    // Separate BRL and LATAM
    const brlSales   = approved.filter((s: any) => (s.purchase?.price?.currency_code || 'BRL') === 'BRL');
    const latamSales = approved.filter((s: any) => (s.purchase?.price?.currency_code || 'BRL') !== 'BRL');

    // For each sale, extract every tracking-related field we can find
    function extractTracking(s: any) {
      const p   = s.purchase || {};
      const trk = p.tracking || {};
      const ori = p.origin   || {};

      // Deep-scan the entire purchase object for any field containing "utm" or "src" or "sck"
      const utmFields: Record<string, any> = {};
      function scan(obj: any, prefix = '') {
        if (!obj || typeof obj !== 'object') return;
        for (const [k, v] of Object.entries(obj)) {
          const key = prefix ? `${prefix}.${k}` : k;
          if (typeof v === 'string' || typeof v === 'number') {
            const kl = k.toLowerCase();
            if (
              kl.includes('utm') || kl.includes('src') || kl.includes('sck') ||
              kl.includes('xcod') || kl.includes('track') || kl.includes('origin') ||
              kl.includes('source') || kl.includes('campaign') || kl.includes('medium')
            ) {
              utmFields[key] = v;
            }
          } else if (v && typeof v === 'object') {
            scan(v, key);
          }
        }
      }
      scan(p);

      return {
        transaction:   p.transaction,
        status:        p.status,
        currency:      p.price?.currency_code,
        amount:        p.price?.value,
        product:       s.product?.name,
        buyer:         s.buyer?.name,
        approved_date: new Date(p.approved_date || p.order_date || 0).toISOString(),
        // Native tracking object (might have utm fields)
        tracking:      trk,
        origin:        ori,
        // All found UTM-related fields
        found_utm_fields: utmFields,
        // All keys in purchase object
        purchase_keys: Object.keys(p),
      };
    }

    const brlSample   = brlSales.slice(0, 10).map(extractTracking);
    const latamSample = latamSales.slice(0, 5).map(extractTracking);

    // Summary: which sales have ANY tracking data
    const withTracking = approved.filter((s: any) => {
      const t = s.purchase?.tracking || {};
      const o = s.purchase?.origin   || {};
      return Object.keys(t).length > 0 || Object.keys(o).length > 0;
    });

    const trackingFields = new Set<string>();
    withTracking.forEach((s: any) => {
      const t = s.purchase?.tracking || {};
      const o = s.purchase?.origin   || {};
      Object.keys(t).forEach(k => trackingFields.add(`tracking.${k}`));
      Object.keys(o).forEach(k => trackingFields.add(`origin.${k}`));
    });

    return NextResponse.json({
      period_days:      days,
      total_items:      items.length,
      total_approved:   approved.length,
      brl_count:        brlSales.length,
      latam_count:      latamSales.length,
      with_tracking:    withTracking.length,
      tracking_fields_found: Array.from(trackingFields),
      brl_sample:       brlSample,
      latam_sample:     latamSample,
      hint: 'Check "found_utm_fields" and "tracking" in each sale to see what attribution data Hotmart API exposes',
    });

  } catch (e: any) {
    return NextResponse.json({ crashed: true, error: e.message });
  }
}
