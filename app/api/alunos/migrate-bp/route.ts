import { NextResponse } from 'next/server';
import { ensureBuyerPersonaColumns } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/alunos/migrate-bp
 *  Adds buyer-persona columns to buyer_profiles (safe, idempotent). */
export async function GET() {
  try {
    await ensureBuyerPersonaColumns();
    return NextResponse.json({ success: true, message: 'Colunas buyer_persona adicionadas/verificadas.' });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
