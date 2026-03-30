import { NextResponse } from 'next/server';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { fetchActiveSubscriptionsByProduct } from '@/app/lib/hotmartApi';
import { getCache, setCache } from '@/app/lib/metaApi';

// Statuses that mean the student has legitimate paid access (per Hotmart docs)
const APPROVED  = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);
const CACHE_KEY = 'cursos_list_v5'; // bump: now uses subscriptions + sales
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

export async function GET() {
  try {
    // Fast cache hit
    const hit = getCache(CACHE_KEY);
    if (hit?.expires_at > Date.now()) return NextResponse.json(hit.data);

    // Fetch both sources in parallel — subscriptions give active members,
    // sales give lifetime-access buyers (non-subscription purchases).
    const [sales, activeSubsMap] = await Promise.all([
      getCachedAllSales(),
      fetchActiveSubscriptionsByProduct().catch(() => new Map<string, Set<string>>()),
    ]);

    // Build courseMap from sales (email-deduplicated, approved only)
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

    // Merge active subscription emails into the courseMap.
    // This adds subscription-only students that may not appear in one-time sales,
    // and ensures subscription students are counted even if their sales record
    // has a different status (e.g. DELAYED).
    activeSubsMap.forEach((emailSet, productName) => {
      // Try exact match first, then fuzzy match
      let entry = courseMap.get(productName);

      if (!entry) {
        // Fuzzy: find the closest sales product name
        const cleanSub = productName.toLowerCase();
        for (const [k, v] of courseMap) {
          if (k.toLowerCase().includes(cleanSub) || cleanSub.includes(k.toLowerCase())) {
            entry = v;
            break;
          }
        }
      }

      if (!entry) {
        // New product only known via subscriptions
        courseMap.set(productName, { id: 0, name: productName, emails: new Set(emailSet) });
      } else {
        emailSet.forEach(e => entry!.emails.add(e));
      }
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
