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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30');

  try {
    const clientId     = process.env.HOTMART_CLIENT_ID     || '';
    const clientSecret = process.env.HOTMART_CLIENT_SECRET || '';
    const basicToken   = process.env.HOTMART_BASIC_TOKEN   || '';
    const authHeader   = basicToken.startsWith('Basic ') ? basicToken : `Basic ${basicToken}`;

    const authPath = `/security/oauth/token?grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`;
    const authResult = await httpsPost(HOTMART_AUTH_URL, authPath, { 'Authorization': authHeader });

    let authData: any;
    try { authData = JSON.parse(authResult.body); } catch { return NextResponse.json({ step: 'auth_parse_fail' }); }
    if (!authData?.access_token) return NextResponse.json({ step: 'auth_no_token' });

    const token = authData.access_token as string;

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

    // Find first approved sale AND one with installments (to inspect both structures)
    const approvedSample = items.find((s: any) =>
      ['APPROVED','COMPLETE'].includes(s.purchase?.status || '')
    );
    const installmentSample = items.find((s: any) =>
      ['APPROVED','COMPLETE'].includes(s.purchase?.status || '') &&
      (s.purchase?.payment?.installments_number || 1) > 1
    );

    const approvedCount  = (statusCount['APPROVED']  || 0) + (statusCount['COMPLETE'] || 0);
    const confirmedCount = (statusCount['PRODUCER_CONFIRMED'] || 0) + (statusCount['CONFIRMED'] || 0);
    const activeCount    = statusCount['ACTIVE'] || 0;

    let revenueValue = 0, revenueBase = 0, revenueActual = 0;
    const seenTx = new Set();
    items.forEach((s: any) => {
      const st = s.purchase?.status || '';
      if (!['APPROVED','COMPLETE'].includes(st)) return;
      const tx = s.purchase?.transaction;
      if (seenTx.has(tx)) return;
      seenTx.add(tx);
      revenueValue  += s.purchase?.price?.value        || 0;
      revenueBase   += s.purchase?.price?.base         || 0;
      revenueActual += s.purchase?.price?.actual_value ?? s.purchase?.price?.value ?? 0;
    });

    return NextResponse.json({
      period_days:      days,
      total_api_items:  items.length,
      page_total:       salesData?.page_info?.total_results,
      status_breakdown: statusCount,
      approved_complete_count: approvedCount,
      confirmed_count:  confirmedCount,
      active_count:     activeCount,
      revenue_with_APPROVED_COMPLETE: {
        value:        revenueValue,
        base:         revenueBase,
        actual_value: revenueActual,
      },
      // Full raw items to identify all available fields
      raw_approved_sample:    approvedSample    || null,
      raw_installment_sample: installmentSample || null,
    });

  } catch (e: any) {
    return NextResponse.json({ crashed: true, error: e.message });
  }
}
