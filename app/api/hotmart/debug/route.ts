import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HOTMART_AUTH_URL  = 'https://api-sec-vlc.hotmart.com/security/oauth/token';
const HOTMART_API_BASE  = 'https://developers.hotmart.com/payments/api/v1';

export async function GET() {
  try {
    const clientId     = process.env.HOTMART_CLIENT_ID     || '';
    const clientSecret = process.env.HOTMART_CLIENT_SECRET || '';
    const basicToken   = process.env.HOTMART_BASIC_TOKEN   || '';
    const authHeader   = basicToken.startsWith('Basic ') ? basicToken : `Basic ${basicToken}`;

    // Auth — sem cache, direto ao endpoint
    const authResp = await fetch(
      `${HOTMART_AUTH_URL}?grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
      {
        method : 'POST',
        headers: { 'Authorization': authHeader }, // sem Content-Type
        cache  : 'no-store',
      }
    );
    const authText = await authResp.text();
    let authData: any;
    try { authData = JSON.parse(authText); } catch { return NextResponse.json({ step: 'auth_json_parse_failed', raw: authText }); }
    if (!authData?.access_token) return NextResponse.json({ step: 'auth_no_token', raw: authData, client_id_first8: clientId.substring(0, 8) });

    const token   = authData.access_token as string;
    const headers = { 'Authorization': `Bearer ${token}` };

    // Sales — requisição minimalista sem nenhum parâmetro extra
    const now  = Date.now();
    const past = now - (7 * 24 * 60 * 60 * 1000);
    const url  = `${HOTMART_API_BASE}/sales/history?start_date=${past}&end_date=${now}`;

    const salesResp = await fetch(url, { headers, cache: 'no-store' });
    const salesText = await salesResp.text();
    let salesData: any;
    try { salesData = JSON.parse(salesText); } catch { return NextResponse.json({ step: 'sales_json_parse_failed', url, raw: salesText }); }

    return NextResponse.json({
      success           : salesResp.ok,
      sales_status      : salesResp.status,
      total_results     : salesData?.page_info?.total_results,
      sample_product    : salesData?.items?.[0]?.product?.name,
      error_from_hotmart: salesData?.error || null,
      client_id_first8  : clientId.substring(0, 8),
      token_first8      : token.substring(0, 8),
    });

  } catch (e: any) {
    return NextResponse.json({ crashed: true, error: e.message });
  }
}
