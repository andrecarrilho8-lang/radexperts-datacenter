import { NextResponse } from 'next/server';
import https from 'https';
import { getHotmartToken } from '@/app/lib/hotmartApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function clubGet(token: string, path: string): Promise<{ status: number; body: any }> {
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

// Candidate subdomains to test
const CANDIDATES = [
  'neuroexperts', 'neuroexpert', 'radexperts', 'radexpert',
  'cepexpert', 'bodyexpert', 'academiaalzheimerexpert', 'alzheimerexpert',
  'skeletalexpert', 'wexpert', 'neuroreview',
];

export async function GET() {
  try {
    const token = await getHotmartToken();

    const results: Record<string, any> = {};
    await Promise.all(CANDIDATES.map(async (sub) => {
      const r = await clubGet(token, `/club/api/v1/users?subdomain=${sub}&max_results=5`);
      results[sub] = {
        status:  r.status,
        count:   r.body?.total ?? r.body?.data?.length ?? 0,
        error:   r.body?.error || r.body?.message || null,
        sample:  r.body?.data?.[0] || null,
      };
    }));

    // Also check memberships listing endpoint
    const memberships = await clubGet(token, '/club/api/v1/memberships');

    return NextResponse.json({
      token: token?.slice(0, 20) + '...',
      memberships,
      subdomainTests: results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
