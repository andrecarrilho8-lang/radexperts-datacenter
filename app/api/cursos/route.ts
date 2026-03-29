import { NextResponse } from 'next/server';
import { fetchHotmartSales } from '@/app/lib/hotmartApi';
import { getCache, setCache } from '@/app/lib/metaApi';

const APPROVED = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);
const CACHE_KEY = 'cursos_list_v2';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET() {
  try {
    const cached = getCache(CACHE_KEY);
    if (cached && cached.expires_at > Date.now()) {
      return NextResponse.json(cached.data);
    }

    const since = new Date('2023-01-01').toISOString();
    const now   = new Date().toISOString();
    const sales = await fetchHotmartSales(since, now, 60 * 24 * 60 * 60 * 1000, 8);

    // Group by product — deduplicate students by email per course
    const courseMap = new Map<string, { id: number; name: string; emails: Set<string> }>();

    sales.forEach((s: any) => {
      if (!APPROVED.has(s.purchase?.status)) return;
      const prod = s.product;
      if (!prod?.name) return;
      const email = (s.buyer?.email || '').toLowerCase();
      if (!courseMap.has(prod.name)) {
        courseMap.set(prod.name, { id: prod.id || 0, name: prod.name, emails: new Set() });
      }
      if (email) courseMap.get(prod.name)!.emails.add(email);
    });

    const courses = Array.from(courseMap.values())
      .map(c => ({ id: c.id, name: c.name, students: c.emails.size }))
      .sort((a, b) => b.students - a.students);

    const result = { courses };
    setCache(CACHE_KEY, { data: result, expires_at: Date.now() + CACHE_TTL });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
