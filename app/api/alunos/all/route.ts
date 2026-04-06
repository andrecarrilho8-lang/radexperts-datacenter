import { NextRequest, NextResponse } from 'next/server';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { getCache, setCache } from '@/app/lib/metaApi';
import { getDb } from '@/app/lib/db';

const ACTIVE_STATUSES = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);
const CACHE_KEY = 'all_students_v2';
const CACHE_TTL = 30 * 60 * 1000; // 30 min

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get('search') || '').toLowerCase().trim();
  const course = (searchParams.get('course') || '').trim();
  const page   = Math.max(0, parseInt(searchParams.get('page') || '0', 10));
  const size   = Math.min(200, Math.max(10, parseInt(searchParams.get('size') || '100', 10)));

  try {
    // ── Cache check (full list, no filters) ──
    const hit = getCache(CACHE_KEY);
    let allStudents: any[] = hit?.expires_at > Date.now() ? hit.data : null;

    if (!allStudents) {
      const [sales, manualRows] = await Promise.all([
        getCachedAllSales(),
        (async () => {
          try {
            const sql = getDb();
            return await sql`
              SELECT id, course_name, name, email, phone, entry_date,
                     payment_type, total_amount, installments, installment_amount,
                     notes, created_at
              FROM manual_students
              ORDER BY created_at DESC
            ` as any[];
          } catch { return []; }
        })(),
      ]);

      // ── Build from Hotmart sales ──
      // key = email+course, deduplicated (keep first/latest)
      type Row = {
        email: string; name: string; courseName: string;
        entryDate: number | null; source: 'hotmart' | 'manual';
        paymentType: string; valor: number; currency: string;
        turma: string; transaction: string;
      };

      const map = new Map<string, Row>();

      for (const s of sales) {
        if (!ACTIVE_STATUSES.has(s.purchase?.status)) continue;
        const prodName = (s.product?.name || '').trim();
        if (!prodName) continue;
        const email   = (s.buyer?.email || '').toLowerCase().trim();
        if (!email) continue;
        const key     = `${email}__${prodName}`;
        const ts      = s.purchase?.approved_date || s.purchase?.order_date || 0;
        const existing = map.get(key);
        if (!existing || ts > (existing.entryDate || 0)) {
          map.set(key, {
            email,
            name:        (s.buyer?.name || '').trim().toUpperCase(),
            courseName:  prodName,
            entryDate:   ts || null,
            source:      'hotmart',
            paymentType: (s.purchase?.payment?.type || '').toUpperCase(),
            valor:       s.purchase?.price?.value || 0,
            currency:    (s.purchase?.price?.currency_code || 'BRL').toUpperCase(),
            turma:       s.purchase?.offer?.code || '',
            transaction: s.purchase?.transaction || '',
          });
        }
      }

      // ── Merge manual students ──
      for (const ms of manualRows) {
        const email     = (ms.email || '').toLowerCase().trim();
        const courseName = (ms.course_name || '').trim();
        if (!email || !courseName) continue;
        const key = `${email}__${courseName}`;
        map.set(key, {
          email,
          name:        (ms.name || '').trim().toUpperCase(),
          courseName,
          entryDate:   ms.entry_date ? Number(ms.entry_date) : null,
          source:      'manual',
          paymentType: ms.payment_type || '',
          valor:       ms.installment_amount || ms.total_amount || 0,
          currency:    'BRL',
          turma:       '',
          transaction: ms.id || '',
        });
      }

      allStudents = Array.from(map.values())
        .sort((a, b) => (b.entryDate || 0) - (a.entryDate || 0));

      setCache(CACHE_KEY, { data: allStudents, expires_at: Date.now() + CACHE_TTL });
    }

    // ── Filter ──
    let list = allStudents;
    if (course)  list = list.filter(s => s.courseName === course);
    if (search)  list = list.filter(s =>
      s.name.toLowerCase().includes(search) ||
      s.email.includes(search) ||
      s.courseName.toLowerCase().includes(search)
    );

    const total    = list.length;
    const students = list.slice(page * size, (page + 1) * size);

    // Unique course names for filter
    const courses  = Array.from(new Set(allStudents.map(s => s.courseName))).sort();

    return NextResponse.json({ students, total, page, size, courses });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
