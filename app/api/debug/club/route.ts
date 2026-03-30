import { NextResponse } from 'next/server';
import https from 'https';
import { getHotmartToken } from '@/app/lib/hotmartApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function clubReq(token: string, path: string, useHottok = false): Promise<{ status: number; headers: any; raw: string }> {
  return new Promise((resolve) => {
    const hottok = process.env.HOTMART_HOTTOK || '';
    const authHeader = useHottok ? `HOTTOK ${hottok}` : `Bearer ${token}`;
    const req = https.request(
      {
        hostname: 'developers.hotmart.com',
        path,
        method: 'GET',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          resolve({ status: res.statusCode || 0, headers: res.headers, raw: data.slice(0, 3000) });
        });
      }
    );
    req.on('error', (e) => resolve({ status: 0, headers: {}, raw: e.message }));
    req.end();
  });
}

export async function GET() {
  try {
    const token = await getHotmartToken();

    const [a, b, c, d, e] = await Promise.all([
      // Standard bearer
      clubReq(token, '/club/api/v1/users?subdomain=neuroexperts'),
      // With pagination params
      clubReq(token, '/club/api/v1/users?subdomain=neuroexperts&page=0&rows=5'),
      // HOTTOK auth
      clubReq(token, '/club/api/v1/users?subdomain=neuroexperts', true),
      // Different endpoint format
      clubReq(token, '/club/api/v1/users?subdomain=neuroexperts&size=5'),
      // Try products/memberships
      clubReq(token, '/payments/api/v1/subscriptions?product_id=&max_results=5'),
    ]);

    return NextResponse.json({ token: token.slice(0, 20) + '...', a, b, c, d, e });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
