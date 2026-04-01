import { NextResponse } from 'next/server';
import { ensureSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    await ensureSchema();
    return NextResponse.json({ success: true, message: 'Schema criado/verificado com sucesso.' });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
