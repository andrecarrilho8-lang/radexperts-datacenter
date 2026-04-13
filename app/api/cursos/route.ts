import { NextResponse } from 'next/server';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { fetchActiveSubscriptionsByProduct } from '@/app/lib/hotmartApi';
import { getCache, setCache } from '@/app/lib/metaApi';
import { getDb } from '@/app/lib/db';

// Statuses that mean the student has legitimate paid access (per Hotmart docs)
const APPROVED  = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);
const CACHE_KEY   = 'cursos_list_v10';
const CACHE_TTL   = 2 * 60 * 1000;  // 2 min fresh — manual students appear quickly
const STALE_TTL   = 5 * 60 * 1000;  // 5 min stale-while-revalidate
let _revalidating = false;

async function buildCourseList() {
  const [sales, activeSubsMap, manualRows, hiddenRows] = await Promise.all([
    getCachedAllSales(),
    fetchActiveSubscriptionsByProduct().catch(() => new Map<string, Set<string>>()),
    (async () => {
      try {
        const sql = getDb();
        const rows = (await sql`SELECT course_name, email FROM manual_students`) as { course_name: string; email: string }[];
        const map = new Map<string, Set<string>>();
        for (const r of rows) {
          if (!r.course_name || !r.email) continue;
          if (!map.has(r.course_name)) map.set(r.course_name, new Set());
          map.get(r.course_name)!.add(r.email.toLowerCase());
        }
        return map;
      } catch { return new Map<string, Set<string>>(); }
    })(),
    (async () => {
      try {
        const sql = getDb();
        const rows = (await sql`SELECT course_name, email FROM hidden_students`) as { course_name: string; email: string }[];
        const map = new Map<string, Set<string>>();
        for (const r of rows) {
          if (!r.course_name || !r.email) continue;
          if (!map.has(r.course_name)) map.set(r.course_name, new Set());
          map.get(r.course_name)!.add(r.email.toLowerCase());
        }
        return map;
      } catch { return new Map<string, Set<string>>(); }
    })(),
  ]);

  const courseMap = new Map<string, { id: number; name: string; emails: Set<string> }>();
  sales.forEach((s: any) => {
    if (!APPROVED.has(s.purchase?.status)) return;
    const prod = s.product; if (!prod?.name) return;
    const name  = prod.name.trim();
    const email = (s.buyer?.email || '').toLowerCase();
    if (!courseMap.has(name)) courseMap.set(name, { id: prod.id || 0, name, emails: new Set() });
    if (email) courseMap.get(name)!.emails.add(email);
  });
  activeSubsMap.forEach((emailSet, productName) => {
    const name = productName.trim();
    let entry = courseMap.get(name);
    if (!entry) {
      const lower = name.toLowerCase();
      for (const [k, v] of courseMap) {
        if (k.toLowerCase().includes(lower) || lower.includes(k.toLowerCase())) { entry = v; break; }
      }
    }
    if (!entry) courseMap.set(name, { id: 0, name, emails: new Set(emailSet) });
    else emailSet.forEach(e => entry!.emails.add(e));
  });

  // ── Slug helper — same logic as app/lib/slug.ts ───────────────────────────
  function slugify(name: string): string {
    return name
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
  }

  // Build a slug → entry map for fast slug-based lookup
  function findEntryByName(name: string) {
    const nameSlug = slugify(name);
    // 1. exact match
    let entry = courseMap.get(name);
    if (entry) return entry;
    // 2. case-insensitive exact
    const lower = name.toLowerCase();
    for (const [k, v] of courseMap) {
      if (k.toLowerCase() === lower) return v;
    }
    // 3. slug match (handles accents / extra spaces)
    for (const [k, v] of courseMap) {
      if (slugify(k) === nameSlug) return v;
    }
    return null;
  }

  manualRows.forEach((emailSet, courseName) => {
    const name  = courseName.trim();
    const entry = findEntryByName(name);
    if (!entry) courseMap.set(name, { id: 0, name, emails: new Set(emailSet) });
    else emailSet.forEach(e => entry!.emails.add(e));
  });
  hiddenRows.forEach((hiddenEmails, courseName) => {
    const entry = findEntryByName(courseName.trim());
    if (entry) hiddenEmails.forEach(e => entry.emails.delete(e));
  });

  return {
    courses: Array.from(courseMap.values())
      .map(c => ({ id: c.id, name: c.name, students: c.emails.size }))
      .sort((a, b) => b.students - a.students),
  };
}

export async function GET() {
  try {
    const hit = getCache(CACHE_KEY);
    const now = Date.now();

    // ── FRESH: serve imediatamente ───────────────────────────────────────
    if (hit?.expires_at > now) {
      return NextResponse.json(hit.data, {
        headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
      });
    }

    // ── STALE: retorna dados antigos e revalida em background ────────────
    if (hit?.stale_until > now && !_revalidating) {
      _revalidating = true;
      buildCourseList()
        .then(result => setCache(CACHE_KEY, { data: result, expires_at: now + CACHE_TTL, stale_until: now + STALE_TTL }))
        .catch(e => console.error('[cursos revalidate]', e))
        .finally(() => { _revalidating = false; });
      return NextResponse.json(hit.data, {
        headers: { 'Cache-Control': 'public, max-age=0, stale-while-revalidate=86400' },
      });
    }

    // ── COLD: primeira carga ou cache muito antigo ────────────────────────
    const result = await buildCourseList();
    setCache(CACHE_KEY, { data: result, expires_at: now + CACHE_TTL, stale_until: now + STALE_TTL });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
