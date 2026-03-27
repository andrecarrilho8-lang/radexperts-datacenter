import { NextResponse } from 'next/server';
import { getCache, setCache, initSDK } from '@/app/lib/metaApi';

export async function GET() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId)
    return NextResponse.json({ error: 'Missing credentials', list: [] }, { status: 500 });

  const cacheKey = `campaigns_list_v2`;
  const cached = getCache(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const { AdAccount } = initSDK(accessToken);
    const account = new AdAccount(adAccountId);

    const cursor = await account.getCampaigns(
      ['id', 'name', 'effective_status'],
      { limit: 500 }
    );

    // Convert cursor to plain array — SDK returns cursor-like object
    const raw: any[] = [];
    for (const c of cursor) {
      raw.push({
        id: c.id || (c as any)._data?.id,
        name: c.name || (c as any)._data?.name,
        status: (c as any).effective_status || (c as any)._data?.effective_status,
      });
    }

    setCache(cacheKey, raw);
    return NextResponse.json(raw);
  } catch (err: any) {
    console.error('[campaigns-list] error:', err?.message || err);
    return NextResponse.json([]);
  }
}
