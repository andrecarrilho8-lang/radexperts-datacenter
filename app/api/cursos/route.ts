import { NextResponse } from 'next/server';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { getCache, setCache } from '@/app/lib/metaApi';

const APPROVED  = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);
const CACHE_KEY = 'cursos_list_v3';
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

export async function GET() {
  try {
    // Fast cache hit
    const hit = getCache(CACHE_KEY);
    if (hit?.expires_at > Date.now()) return NextResponse.json(hit.data);

    const sales = await getCachedAllSales();

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
