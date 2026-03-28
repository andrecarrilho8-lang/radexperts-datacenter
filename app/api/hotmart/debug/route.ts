import { NextResponse } from 'next/server';

const HOTMART_AUTH_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token';
const HOTMART_API_BASE = 'https://developers.hotmart.com/payments/api/v1';

export async function GET() {
  const clientId     = process.env.HOTMART_CLIENT_ID;
  const clientSecret = process.env.HOTMART_CLIENT_SECRET;
  const basicToken   = process.env.HOTMART_BASIC_TOKEN;

  // 1. Check credentials exist
  if (!clientId || !clientSecret || !basicToken) {
    return NextResponse.json({
      step: 'credentials_check',
      error: 'Missing credentials',
      clientId: !!clientId,
      clientSecret: !!clientSecret,
      basicToken: !!basicToken,
    });
  }

  const authHeaderValue = basicToken.startsWith('Basic ') ? basicToken : `Basic ${basicToken}`;

  // 2. Get token
  let token: string;
  try {
    const authResp = await fetch(
      `${HOTMART_AUTH_URL}?grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': authHeaderValue }, cache: 'no-store' }
    );
    const authData = await authResp.json();
    if (!authData.access_token) {
      return NextResponse.json({ step: 'auth', error: 'No token returned', raw: authData });
    }
    token = authData.access_token;
  } catch (e: any) {
    return NextResponse.json({ step: 'auth', error: e.message });
  }

  // 3. Fetch sales – simplest possible request (no extra params)
  const now  = Date.now();
  const past = now - (7 * 24 * 60 * 60 * 1000); // 7 days only
  const url  = `${HOTMART_API_BASE}/sales/history?start_date=${past}&end_date=${now}`;

  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store'
  });

  if (!resp.ok) {
    const text = await resp.text();
    return NextResponse.json({ step: 'sales_fetch', status: resp.status, text, url });
  }

  const data  = await resp.json();
  const items = data.items || [];
  const products = [...new Set(items.map((i: any) => i.product?.name as string))];

  return NextResponse.json({
    success: true,
    total_results: data.page_info?.total_results,
    fetched: items.length,
    products_found: products,
  });
}
