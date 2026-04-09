import { NextResponse } from 'next/server';
import { getDb, ensureWebhookSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* GET /api/alunos/vendedores
   Returns a map of email → vendedor for all buyer_profiles with a vendedor set.
   Used by the Vendas page to filter/display vendedor for Hotmart sales.
*/
export async function GET() {
  try {
    await ensureWebhookSchema();
    const sql = getDb();
    const rows = (await sql`
      SELECT email, vendedor FROM buyer_profiles
      WHERE vendedor IS NOT NULL AND TRIM(vendedor) != ''
    `) as { email: string; vendedor: string }[];

    const map: Record<string, string> = {};
    for (const r of rows) {
      if (r.email) map[r.email.toLowerCase()] = r.vendedor;
    }

    // Also return unique vendedor list for filter UI
    const vendedores = [...new Set(Object.values(map))].sort();

    return NextResponse.json({ ok: true, map, vendedores });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
