/**
 * app/api/conta-azul/status/route.ts
 * Retorna o status atual da conexão com a Conta Azul (tokens no KV).
 */

import { NextResponse } from 'next/server';
import { getContaAzulStatus } from '@/app/lib/contaAzulAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const status = await getContaAzulStatus();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
