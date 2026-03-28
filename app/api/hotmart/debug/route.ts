import { NextResponse } from 'next/server';

const HOTMART_AUTH_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token';
const HOTMART_API_BASE = 'https://developers.hotmart.com/payments/api/v1';

export async function GET() {
  const clientId     = process.env.HOTMART_CLIENT_ID;
  const clientSecret = process.env.HOTMART_CLIENT_SECRET;
  const basicToken   = process.env.HOTMART_BASIC_TOKEN;

  const authHeaderValue = (basicToken || '').startsWith('Basic ') ? basicToken! : `Basic ${basicToken}`;

  // Get token
  const authResp = await fetch(
    `${HOTMART_AUTH_URL}?grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': authHeaderValue }, cache: 'no-store' }
  );
  const authData = await authResp.json();
  const token = authData.access_token;
  if (!token) return NextResponse.json({ step: 'auth_failed', raw: authData });

  const headers = { 'Authorization': `Bearer ${token}` };

  // Step A: busca lista de produtos da conta
  const productsResp = await fetch('https://developers.hotmart.com/product/api/v1/products', 
    { headers, cache: 'no-store' }
  );
  const productsData = await productsResp.json();
  const productIds: number[] = (productsData.items || []).map((p: any) => p.id);

  // Step B: tenta sales/history sem product_id
  const now  = Date.now();
  const past = now - (7 * 24 * 60 * 60 * 1000);

  const noFilterUrl = `${HOTMART_API_BASE}/sales/history?start_date=${past}&end_date=${now}`;
  const noFilterResp = await fetch(noFilterUrl, { headers, cache: 'no-store' });
  const noFilterStatus = noFilterResp.status;
  const noFilterData   = noFilterResp.ok ? await noFilterResp.json() : await noFilterResp.text();

  // Step C: se tiver produto, tenta com o primeiro product_id  
  let withProductStatus = null;
  let withProductData  = null;
  let withProductUrl   = null;
  if (productIds.length > 0) {
    withProductUrl  = `${HOTMART_API_BASE}/sales/history?start_date=${past}&end_date=${now}&product_id=${productIds[0]}`;
    const wpResp    = await fetch(withProductUrl, { headers, cache: 'no-store' });
    withProductStatus = wpResp.status;
    withProductData   = wpResp.ok ? await wpResp.json() : await wpResp.text();
  }

  return NextResponse.json({
    token_ok: true,
    products_endpoint_status: productsResp.status,
    product_ids_found: productIds,
    test_no_filter: { status: noFilterStatus, url: noFilterUrl, data: noFilterData },
    test_with_product_id: { status: withProductStatus, url: withProductUrl, data: withProductData },
  });
}
