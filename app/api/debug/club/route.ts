import { NextResponse } from 'next/server';
import https from 'https';
import { getHotmartToken } from '@/app/lib/hotmartApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function clubGet(token: string, path: string): Promise<{ status: number; body: any; raw: string }> {
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
          resolve({ status: res.statusCode || 0, body, raw: data.slice(0, 2000) });
        });
      }
    );
    req.on('error', (e) => resolve({ status: 0, body: null, raw: e.message }));
    req.end();
  });
}

export async function GET() {
  try {
    const token = await getHotmartToken();

    // Test only neuroexperts first to see full raw response structure
    const r1 = await clubGet(token, `/club/api/v1/users?subdomain=neuroexperts`);
    const r2 = await clubGet(token, `/club/api/v1/users?subdomain=neuroexperts&max_results=3`);
    const r3 = await clubGet(token, `/club/api/v1/memberships`);
    const r4 = await clubGet(token, `/club/api/v1/users?subdomain=alzheimerexpert`);

    // Keys in responses to understand structure
    const keys1 = r1.body ? Object.keys(r1.body) : [];
    const keys2 = r2.body ? Object.keys(r2.body) : [];

    return NextResponse.json({
      token: token?.slice(0, 20) + '...',
      neuroexperts_noParam:    { status: r1.status, keys: keys1, raw: r1.raw },
      neuroexperts_maxResults: { status: r2.status, keys: keys2, raw: r2.raw },
      alzheimerexpert:         { status: r4.status, keys: r4.body ? Object.keys(r4.body) : [], raw: r4.raw },
      memberships:             { status: r3.status, keys: r3.body ? Object.keys(r3.body) : [], raw: r3.raw },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
