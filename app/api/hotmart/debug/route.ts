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

export async function GET() {
  try {
    const clientId     = process.env.HOTMART_CLIENT_ID     || '';
    const clientSecret = process.env.HOTMART_CLIENT_SECRET || '';
    const basicToken   = process.env.HOTMART_BASIC_TOKEN   || '';
    const authHeader   = basicToken.startsWith('Basic ') ? basicToken : `Basic ${basicToken}`;

    // Auth via https nativo (bypassa o fetch do Next.js)
    const authPath = `/security/oauth/token?grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`;
    const authResult = await httpsPost(HOTMART_AUTH_URL, authPath, { 'Authorization': authHeader });

    let authData: any;
    try { authData = JSON.parse(authResult.body); } catch { return NextResponse.json({ step: 'auth_parse_fail', raw: authResult.body }); }
    if (!authData?.access_token) return NextResponse.json({ step: 'auth_no_token', status: authResult.status, raw: authData });

    const token = authData.access_token as string;

    // Sales via https nativo
    const now  = Date.now();
    const past = now - (7 * 24 * 60 * 60 * 1000);
    const salesPath = `/payments/api/v1/sales/history?start_date=${past}&end_date=${now}`;
    const salesResult = await httpsGet(HOTMART_API_HOST, salesPath, { 'Authorization': `Bearer ${token}` });

    let salesData: any;
    try { salesData = JSON.parse(salesResult.body); } catch { return NextResponse.json({ step: 'sales_parse_fail', raw: salesResult.body }); }

    return NextResponse.json({
      success          : salesResult.status === 200,
      sales_status     : salesResult.status,
      total_results    : salesData?.page_info?.total_results,
      sample_product   : salesData?.items?.[0]?.product?.name,
      hotmart_error    : salesData?.error || null,
      client_id_first8 : clientId.substring(0, 8),
      token_first8     : token.substring(0, 8),
    });

  } catch (e: any) {
    return NextResponse.json({ crashed: true, error: e.message });
  }
}
