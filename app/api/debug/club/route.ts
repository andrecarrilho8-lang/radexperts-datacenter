import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getHotmartToken() {
  const res = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${process.env.HOTMART_BASIC_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
  });
  const data = await res.json();
  return data.access_token as string;
}

// Candidate subdomains to test — gathered from public product pages
const CANDIDATES = [
  'neuroexperts',
  'neuroexpert',
  'radexperts',
  'radexpert',
  'cepexpert',
  'bodyexpert',
  'academiaalzheimerexpert',
  'alzheimerexpert',
  'skeletalexpert',
  'wexpert',
  'neuroreview',
];

export async function GET() {
  try {
    const token = await getHotmartToken();

    const results: Record<string, any> = {};

    // Test each candidate subdomain
    await Promise.all(CANDIDATES.map(async (sub) => {
      try {
        const res = await fetch(
          `https://developers.hotmart.com/club/api/v1/users?subdomain=${sub}&max_results=5`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        const status = res.status;
        let body: any = null;
        try { body = await res.json(); } catch {}
        results[sub] = { status, count: body?.total || body?.data?.length || 0, error: body?.error || body?.message || null, sample: body?.data?.[0] || null };
      } catch (e: any) {
        results[sub] = { status: 'fetch_error', error: e.message };
      }
    }));

    // Also try listing memberships if endpoint exists
    let memberships: any = null;
    try {
      const mRes = await fetch('https://developers.hotmart.com/club/api/v1/memberships', {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      memberships = { status: mRes.status, body: await mRes.json().catch(() => null) };
    } catch (e: any) {
      memberships = { error: e.message };
    }

    return NextResponse.json({ token: token?.slice(0, 20) + '...', memberships, subdomainTests: results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
