import { NextResponse } from 'next/server';
import { fetchHotmartTopCustomers } from '@/app/lib/hotmartApi';
import { getCache, setCache } from '@/app/lib/metaApi';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === '1';

  const cacheKey = 'hotmart_recorrencia_v4';
  if (!force) {
    const cached = getCache(cacheKey);
    if (cached) return NextResponse.json({ ...cached, fromCache: true });
  }

  try {
    const customers = await fetchHotmartTopCustomers();

    const res = { 
      success: true, 
      results: customers,
      total: customers.length 
    };

    setCache(cacheKey, res);
    return NextResponse.json(res);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
