import { NextResponse } from 'next/server';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { fetchActiveSubscriptionsByProduct } from '@/app/lib/hotmartApi';
import { getCache, setCache } from '@/app/lib/metaApi';
import { getDb } from '@/app/lib/db';

// Statuses that mean the student has legitimate paid access (per Hotmart docs)
const APPROVED  = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);
const CACHE_KEY = 'cursos_list_v7'; // bumped: now subtracts hidden_students
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

export async function GET() {
  try {
    // Fast cache hit
    const hit = getCache(CACHE_KEY);
    if (hit?.expires_at > Date.now()) return NextResponse.json(hit.data);

    // Fetch all sources in parallel
    const [sales, activeSubsMap, manualRows, hiddenRows] = await Promise.all([
      getCachedAllSales(),
      fetchActiveSubscriptionsByProduct().catch(() => new Map<string, Set<string>>()),
      // Count manual students per course (by unique email)
      (async () => {
        try {
          const sql = getDb();
          const rows = (await sql`
            SELECT course_name, email FROM manual_students
          `) as { course_name: string; email: string }[];
          const map = new Map<string, Set<string>>();
          for (const r of rows) {
            if (!r.course_name || !r.email) continue;
            if (!map.has(r.course_name)) map.set(r.course_name, new Set());
            map.get(r.course_name)!.add(r.email.toLowerCase());
          }
          return map;
        } catch {
          return new Map<string, Set<string>>();
        }
      })(),
      // Hidden students per course
      (async () => {
        try {
          const sql = getDb();
          const rows = (await sql`
            SELECT course_name, email FROM hidden_students
          `) as { course_name: string; email: string }[];
          const map = new Map<string, Set<string>>();
          for (const r of rows) {
            if (!r.course_name || !r.email) continue;
            if (!map.has(r.course_name)) map.set(r.course_name, new Set());
            map.get(r.course_name)!.add(r.email.toLowerCase());
          }
          return map;
        } catch {
          return new Map<string, Set<string>>();
        }
      })(),
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

    // Merge active subscription emails
    activeSubsMap.forEach((emailSet, productName) => {
      let entry = courseMap.get(productName);
      if (!entry) {
        const cleanSub = productName.toLowerCase();
        for (const [k, v] of courseMap) {
          if (k.toLowerCase().includes(cleanSub) || cleanSub.includes(k.toLowerCase())) {
            entry = v; break;
          }
        }
      }
      if (!entry) {
        courseMap.set(productName, { id: 0, name: productName, emails: new Set(emailSet) });
      } else {
        emailSet.forEach(e => entry!.emails.add(e));
      }
    });

    // Merge manual students — add their emails to the matching course
    manualRows.forEach((emailSet, courseName) => {
      let entry = courseMap.get(courseName);
      if (!entry) {
        // Create a new entry for courses that only exist as manual
        courseMap.set(courseName, { id: 0, name: courseName, emails: new Set(emailSet) });
      } else {
        emailSet.forEach(e => entry!.emails.add(e));
      }
    });

    // Subtract hidden students from each course
    hiddenRows.forEach((hiddenEmails, courseName) => {
      const entry = courseMap.get(courseName);
      if (entry) hiddenEmails.forEach(e => entry.emails.delete(e));
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
