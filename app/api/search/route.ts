/**
 * GET /api/search?q=<query>&limit=5
 *
 * Busca global em paralelo em todas as fontes de dados:
 *   - Alunos (buyer_profiles + manual_students)
 *   - Cursos (distinct course_name)
 *   - Transações Hotmart (salesCache)
 *   - Campanhas Meta (via metaApi cache)
 *
 * Retorna no máximo `limit` resultados por categoria.
 * Requer mínimo 2 caracteres.
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/app/lib/db';
import { getCachedAllSales } from '@/app/lib/salesCache';
import { getCache } from '@/app/lib/metaApi';

export const dynamic = 'force-dynamic';
export const runtime  = 'nodejs';

/* ── helpers ────────────────────────────────────────────────────────────── */
function match(text: string | null | undefined, q: string): boolean {
  return !!text && text.toLowerCase().includes(q);
}

function R(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

/** Encode email to the same base64 id used by /alunos/[id] route */
function emailToId(email: string): string {
  return Buffer.from(email).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/* ── main ────────────────────────────────────────────────────────────────── */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw   = (searchParams.get('q') || '').trim();
  const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 10);

  if (raw.length < 2) {
    return NextResponse.json({ results: {}, q: raw });
  }

  const q = raw.toLowerCase();

  try {
    const db = getDb();

    /* ── 1. Alunos ── buyer_profiles + manual_students (DB) */
    const alunosPromise = db`
      SELECT
        bp.email,
        COALESCE(bp.name, ms.name) AS name,
        COALESCE(bp.phone, ms.phone) AS phone,
        bp.purchase_count,
        ms.course_name
      FROM buyer_profiles bp
      LEFT JOIN manual_students ms ON LOWER(ms.email) = LOWER(bp.email)
      WHERE
        bp.name    ILIKE ${'%' + q + '%'}
        OR bp.email ILIKE ${'%' + q + '%'}
        OR ms.name  ILIKE ${'%' + q + '%'}
      ORDER BY bp.purchase_count DESC NULLS LAST
      LIMIT ${limit}
    `.then(rows => (rows as any[]).map(r => ({
      type:    'aluno' as const,
      id:      r.email,
      title:   r.name || r.email,
      subtitle: r.email,
      badge:   r.course_name,
      href:    `/alunos/${emailToId(r.email)}`,
      icon:    'person',
      color:   '#38bdf8',
    }))).catch(() => []);

    /* ── 2. Cursos ── distinct course names from manual_students */
    const cursosPromise = db`
      SELECT DISTINCT course_name, COUNT(*) as student_count
      FROM manual_students
      WHERE course_name ILIKE ${'%' + q + '%'}
      GROUP BY course_name
      ORDER BY student_count DESC
      LIMIT ${limit}
    `.then(rows => (rows as any[]).map(r => ({
      type:    'curso' as const,
      id:      r.course_name,
      title:   r.course_name,
      subtitle: `${r.student_count} alunos`,
      badge:   null,
      href:    `/cursos/${encodeURIComponent(r.course_name)}`,
      icon:    'school',
      color:   '#a78bfa',
    }))).catch(() => []);

    /* ── 3. Transações Hotmart ── salesCache */
    const vendasPromise = getCachedAllSales().then(all => {
      const hits: any[] = [];
      for (const s of all) {
        if (hits.length >= limit) break;
        if (
          match(s.buyer_name, q) ||
          match(s.buyer_email, q) ||
          match(s.product_name, q) ||
          match(s.transaction, q)
        ) {
          hits.push({
            type:    'venda' as const,
            id:      s.transaction || s.id,
            title:   s.buyer_name  || s.buyer_email,
            subtitle: s.product_name,
            badge:   s.gross_value ? R(Number(s.gross_value)) : null,
            href:    `/alunos/${emailToId(s.buyer_email || '')}`,
            icon:    'shopping_cart',
            color:   '#4ade80',
          });
        }
      }
      return hits;
    }).catch(() => []);

    /* ── 4. Campanhas Meta ── from metaApi cache */
    const campanhasPromise = (async () => {
      try {
        const cached = getCache('meta_campaigns_v1');
        const list: any[] = cached?.data?.campaigns || [];
        return list
          .filter((c: any) => match(c.name, q))
          .slice(0, limit)
          .map((c: any) => ({
            type:    'campanha' as const,
            id:      c.id,
            title:   c.name,
            subtitle: c.status,
            badge:   c.objective,
            href:    `/campanhas/${c.id}`,
            icon:    'campaign',
            color:   '#f59e0b',
          }));
      } catch { return []; }
    })();

    /* ── Run all in parallel ── */
    const [alunos, cursos, vendas, campanhas] = await Promise.all([
      alunosPromise,
      cursosPromise,
      vendasPromise,
      campanhasPromise,
    ]);

    const total = alunos.length + cursos.length + vendas.length + campanhas.length;

    return NextResponse.json({
      q: raw,
      total,
      results: { alunos, cursos, vendas, campanhas },
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
