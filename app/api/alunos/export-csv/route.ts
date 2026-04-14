import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';
import { getCachedAllSales } from '@/app/lib/salesCache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACTIVE_STATUSES = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

function csvCell(val: string | null | undefined): string {
  if (!val) return '';
  const s = val.replace(/"/g, '""');
  return /[,"\n\r]/.test(s) ? `"${s}"` : s;
}

export async function GET() {
  try {
    const sql = getDb();

    // 1. Fetch buyer_profiles (country + phone)
    const profiles = await sql`
      SELECT email, name, phone, country FROM buyer_profiles
    ` as any[];

    const profileMap = new Map<string, { phone: string; country: string; name: string }>();
    for (const p of profiles) {
      if (p.email) profileMap.set(p.email.toLowerCase(), {
        phone:   p.phone   || '',
        country: p.country || '',
        name:    p.name    || '',
      });
    }

    // 2. Fetch manual_students (phone override)
    const manualRows = await sql`
      SELECT DISTINCT ON (email) email, name, phone
      FROM manual_students
      ORDER BY email, created_at DESC
    ` as any[];

    const manualMap = new Map<string, { phone: string; name: string }>();
    for (const m of manualRows) {
      if (m.email) manualMap.set(m.email.toLowerCase(), {
        phone: m.phone || '',
        name:  m.name  || '',
      });
    }

    // 3. All emails from Hotmart sales
    const sales = await getCachedAllSales();
    const studentMap = new Map<string, { name: string; email: string; phone: string; country: string }>();

    for (const s of sales) {
      if (!ACTIVE_STATUSES.has(s.purchase?.status)) continue;
      const email = (s.buyer?.email || '').toLowerCase().trim();
      if (!email) continue;
      if (!studentMap.has(email)) {
        const prof    = profileMap.get(email);
        const manual  = manualMap.get(email);
        const name    = (s.buyer?.name || prof?.name || manual?.name || '').trim().toUpperCase();
        const phone   = manual?.phone || prof?.phone || '';
        const country = prof?.country || s.buyer?.address?.country || '';
        studentMap.set(email, { name, email, phone, country });
      }
    }

    // 4. Add manual-only students
    for (const [email, m] of manualMap) {
      if (!studentMap.has(email)) {
        const prof    = profileMap.get(email);
        studentMap.set(email, {
          name:    m.name.toUpperCase(),
          email,
          phone:   m.phone || prof?.phone || '',
          country: prof?.country || '',
        });
      }
    }

    // 5. Sort by name
    const rows = Array.from(studentMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    // 6. Build CSV with UTF-8 BOM (for Excel)
    const BOM = '\uFEFF';
    const header = 'Nome,Email,Telefone,País';
    const lines = rows.map(r =>
      [csvCell(r.name), csvCell(r.email), csvCell(r.phone), csvCell(r.country)].join(',')
    );
    const csv = BOM + [header, ...lines].join('\r\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="alunos_radexperts.csv"',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
