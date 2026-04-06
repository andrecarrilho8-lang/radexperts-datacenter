import { NextRequest, NextResponse } from 'next/server';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { getCache, setCache } from '@/app/lib/metaApi';
import { getDb } from '@/app/lib/db';

const ACTIVE_STATUSES = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);
const CACHE_KEY = 'all_students_v4'; // bumped: Hotmart name priority fix
const CACHE_TTL = 30 * 60 * 1000;   // 30 min

// One record per unique email — courses aggregated as an array
type StudentRow = {
  email:      string;
  name:       string;
  courses:    string[];           // all courses this student is enrolled in
  firstEntry: number | null;      // earliest enrollment date
  lastEntry:  number | null;      // most recent enrollment date
  sources:    ('hotmart'|'manual')[];
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get('search') || '').toLowerCase().trim();
  const course = (searchParams.get('course') || '').trim();
  const page   = Math.max(0, parseInt(searchParams.get('page') || '0', 10));
  const size   = Math.min(200, Math.max(10, parseInt(searchParams.get('size') || '100', 10)));

  try {
    // ── Cache check ──
    const hit = getCache(CACHE_KEY);
    let allStudents: StudentRow[] = hit?.expires_at > Date.now() ? hit.data : null;

    if (!allStudents) {
      const [sales, manualRows] = await Promise.all([
        getCachedAllSales(),
        (async () => {
          try {
            const sql = getDb();
            return await sql`
              SELECT DISTINCT ON (email, course_name)
                course_name, name, email, entry_date, payment_type, created_at
              FROM manual_students
              ORDER BY email, course_name, created_at DESC
            ` as any[];
          } catch { return []; }
        })(),
      ]);

      // ── Build per-email map ──
      // Process Hotmart FIRST so its names take priority.
      // Manual imports only fill the name when Hotmart didn't provide one.
      const map = new Map<string, StudentRow>();
      const hotmartNameEmails = new Set<string>(); // emails where Hotmart gave us a real name

      const upsert = (
        email: string,
        name: string,
        courseName: string,
        ts: number | null,
        source: 'hotmart' | 'manual',
      ) => {
        const cleanName = (name || '').trim().toUpperCase();
        const existing  = map.get(email);
        if (!existing) {
          map.set(email, {
            email,
            name:       cleanName,
            courses:    courseName ? [courseName] : [],
            firstEntry: ts,
            lastEntry:  ts,
            sources:    [source],
          });
          if (source === 'hotmart' && cleanName) hotmartNameEmails.add(email);
        } else {
          // Name: Hotmart always wins. Manual only fills an empty slot.
          if (source === 'hotmart' && cleanName) {
            existing.name = cleanName;
            hotmartNameEmails.add(email);
          } else if (source === 'manual' && cleanName && !hotmartNameEmails.has(email) && !existing.name) {
            existing.name = cleanName;
          }
          // Add course if not already present
          if (courseName && !existing.courses.includes(courseName)) existing.courses.push(courseName);
          // Update date range
          if (ts && (existing.firstEntry === null || ts < existing.firstEntry)) existing.firstEntry = ts;
          if (ts && (existing.lastEntry  === null || ts > existing.lastEntry))  existing.lastEntry  = ts;
          // Track source
          if (!existing.sources.includes(source)) existing.sources.push(source);
        }
      };

      // Hotmart sales
      for (const s of sales) {
        if (!ACTIVE_STATUSES.has(s.purchase?.status)) continue;
        const prodName = (s.product?.name || '').trim();
        const email    = (s.buyer?.email  || '').toLowerCase().trim();
        if (!email) continue;
        const ts = s.purchase?.approved_date || s.purchase?.order_date || null;
        upsert(email, (s.buyer?.name || '').trim(), prodName, ts, 'hotmart');
      }

      // Manual students
      for (const ms of manualRows) {
        const email     = (ms.email       || '').toLowerCase().trim();
        const courseName = (ms.course_name || '').trim();
        if (!email) continue;
        upsert(email, (ms.name || '').trim(), courseName, ms.entry_date ? Number(ms.entry_date) : null, 'manual');
      }

      allStudents = Array.from(map.values())
        // Sort by most recent activity
        .sort((a, b) => (b.lastEntry || 0) - (a.lastEntry || 0));

      setCache(CACHE_KEY, { data: allStudents, expires_at: Date.now() + CACHE_TTL });
    }

    // ── Filter ──
    let list = allStudents;
    if (course) list = list.filter(s => s.courses.includes(course));
    if (search) list = list.filter(s =>
      s.name.toLowerCase().includes(search) ||
      s.email.includes(search) ||
      s.courses.some(c => c.toLowerCase().includes(search))
    );

    const total    = list.length;
    const students = list.slice(page * size, (page + 1) * size);

    // Unique course names for filter dropdown
    const courses = Array.from(
      new Set(allStudents.flatMap(s => s.courses))
    ).sort();

    return NextResponse.json({ students, total, page, size, courses });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
