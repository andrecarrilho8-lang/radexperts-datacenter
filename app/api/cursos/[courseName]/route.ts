import { NextRequest, NextResponse } from 'next/server';
import { fetchHotmartSales } from '@/app/lib/hotmartApi';
import { getCache, setCache } from '@/app/lib/metaApi';

const APPROVED = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function sourceLabel(s: any): string {
  const sck = s.purchase?.tracking?.source_sck || '';
  const src = s.purchase?.tracking?.source || '';
  return sck || src || '—';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseName: string }> }
) {
  const { courseName: rawParam } = await params;
  const { searchParams }        = new URL(req.url);
  const courseName = decodeURIComponent(rawParam);
  const turma      = searchParams.get('turma') || '';

  const CACHE_KEY = `curso_students_v4_${courseName}`;
  const cached    = getCache(CACHE_KEY);
  if (cached && cached.expires_at > Date.now()) {
    const result   = cached.data;
    const students = turma
      ? result.students.filter((st: any) => st.turma === turma)
      : result.students;
    return NextResponse.json({ ...result, students });
  }

  try {
    const since = new Date('2023-01-01').toISOString();
    const now   = new Date().toISOString();
    const sales = await fetchHotmartSales(since, now, 60 * 24 * 60 * 60 * 1000, 8);

    // Filter by product name
    const filtered = sales.filter((s: any) =>
      APPROVED.has(s.purchase?.status) && (s.product?.name || '') === courseName
    );

    // Collect turmas
    const turmasSet = new Set<string>();
    filtered.forEach((s: any) => {
      const t = s.purchase?.offer?.code || '';
      if (t) turmasSet.add(t);
    });

    // Group by email — keep most recent purchase, track subscription recurrency & installments
    const studentMap = new Map<string, any>();
    filtered.forEach((s: any) => {
      const email = (s.buyer?.email || '').toLowerCase();
      if (!email) return;
      const ts = s.purchase?.approved_date || 0;
      const cur = studentMap.get(email);
      // Always keep the latest entry (highest ts = most recent payment)
      if (!cur || ts > (cur._ts || 0)) {
        studentMap.set(email, { ...s, _ts: ts });
      }
    });

    const students = Array.from(studentMap.values()).map((s: any) => {
      const purchase  = s.purchase || {};
      const buyer     = s.buyer    || {};
      const payType   = (purchase.payment?.type || '').toUpperCase();
      const install   = purchase.payment?.installments_number || 1;
      const mode      = (purchase.offer?.payment_mode || '').toUpperCase();
      const isSub     = purchase.is_subscription === true || mode === 'SUBSCRIPTION';
      const recur     = purchase.recurrency_number || 1;
      const entryDate = purchase.approved_date || purchase.order_date || null;

      return {
        name:         (buyer.name  || '—').toUpperCase(),
        email:        (buyer.email || '').toLowerCase(),
        phone:        buyer.phone  || '—',
        entryDate,
        turma:        purchase.offer?.code || '—',
        valor:        purchase.price?.value        ?? 0,
        currency:     purchase.price?.currency_code || 'BRL',
        source:       sourceLabel(s),
        transaction:  purchase.transaction || '',
        // payment details for rich display
        paymentType:        payType,
        paymentInstallments: install,
        paymentIsSub:        isSub,
        paymentRecurrency:   recur,   // how many subscription payments made
      };
    }).sort((a, b) => (b.entryDate || 0) - (a.entryDate || 0));

    const result = { students, turmas: Array.from(turmasSet).sort(), total: students.length };
    setCache(CACHE_KEY, { data: result, expires_at: Date.now() + CACHE_TTL });

    const out = turma ? { ...result, students: students.filter(st => st.turma === turma) } : result;
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
