/**
 * GET /api/financeiro/vendedores
 * Retorna lista de vendedores únicos e produtos únicos do banco.
 * Sem filtro de data — usado para popular selects do wizard de comissões.
 */
import { NextResponse } from 'next/server';
import { getDb, ensureWebhookSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    await ensureWebhookSchema();
    const sql = getDb();

    const [vendRows, courseRows] = await Promise.all([
      // Todos os vendedores distintos com pelo menos 1 aluno
      sql`
        SELECT DISTINCT TRIM(vendedor) AS vendedor
        FROM buyer_profiles
        WHERE vendedor IS NOT NULL AND TRIM(vendedor) != ''
        ORDER BY 1
      ` as Promise<any[]>,
      // Todos os cursos distintos com alunos manuais
      sql`
        SELECT DISTINCT TRIM(course_name) AS course_name
        FROM manual_students
        WHERE course_name IS NOT NULL AND TRIM(course_name) != ''
        ORDER BY 1
      ` as Promise<any[]>,
    ]);

    // Também busca produtos da Hotmart (nomes de produto salvos, se existir tabela)
    let produtosHotmart: string[] = [];
    try {
      const hRows = await sql`
        SELECT DISTINCT TRIM(product_name) AS p
        FROM hotmart_purchases
        WHERE product_name IS NOT NULL AND TRIM(product_name) != ''
        ORDER BY 1
        LIMIT 200
      ` as any[];
      produtosHotmart = hRows.map((r: any) => r.p).filter(Boolean);
    } catch {/* tabela pode não existir */}

    const vendedores = vendRows.map((r: any) => r.vendedor).filter(Boolean);
    const produtos   = [
      ...new Set([
        ...courseRows.map((r: any) => r.course_name).filter(Boolean),
        ...produtosHotmart,
      ]),
    ].sort();

    return NextResponse.json({ vendedores, produtos });
  } catch (e: any) {
    console.error('[vendedores]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
