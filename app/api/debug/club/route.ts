import { NextResponse } from 'next/server';
import https from 'https';
import { getHotmartToken } from '@/app/lib/hotmartApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function hotmartGet(token: string, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    const req = https.request(
      { hostname: 'developers.hotmart.com', path, method: 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let body: any = null;
          try { body = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode || 0, body });
        });
      }
    );
    req.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    req.end();
  });
}

export async function GET() {
  try {
    const token = await getHotmartToken();

    // Fetch first page of subscriptions - see real structure
    const r1 = await hotmartGet(token, '/payments/api/v1/subscriptions?max_results=5');
    
    // Also fetch ACTIVE only
    const r2 = await hotmartGet(token, '/payments/api/v1/subscriptions?max_results=5&status=ACTIVE');

    // Sample keys and first item to understand structure
    const keys1 = r1.body ? Object.keys(r1.body) : [];
    const firstItem = r1.body?.items?.[0];
    const itemKeys  = firstItem ? Object.keys(firstItem) : [];
    const buyerKeys = firstItem?.buyer ? Object.keys(firstItem.buyer) : [];
    const productKeys = firstItem?.product ? Object.keys(firstItem.product) : [];

    return NextResponse.json({
      status: r1.status,
      topLevelKeys: keys1,
      pageInfo: r1.body?.page_info,
      totalItems: r1.body?.items?.length ?? 0,
      itemKeys,
      buyerKeys,
      productKeys,
      sampleItem: firstItem,
      activeStatus: { status: r2.status, count: r2.body?.items?.length ?? 0, pageInfo: r2.body?.page_info },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
