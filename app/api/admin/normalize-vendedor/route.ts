import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';

/**
 * GET /api/admin/normalize-vendedor
 * Normaliza o campo vendedor em buyer_profiles para Title Case.
 * Mapeia qualquer variação de nackson/samuel/alba/pacheco/ana para o padrão correto.
 */
export async function GET() {
  const sql = getDb();

  const VENDEDORES = ['Nackson', 'Samuel', 'Alba', 'Pacheco', 'Ana'];

  let totalUpdated = 0;
  const results: Record<string, number> = {};

  for (const nome of VENDEDORES) {
    const lower = nome.toLowerCase();
    const res = await sql`
      UPDATE buyer_profiles
      SET vendedor = ${nome}
      WHERE LOWER(vendedor) = ${lower}
        AND vendedor != ${nome}
      RETURNING email
    `;
    results[nome] = res.length;
    totalUpdated += res.length;
  }

  return NextResponse.json({
    ok: true,
    totalUpdated,
    breakdown: results,
  });
}
