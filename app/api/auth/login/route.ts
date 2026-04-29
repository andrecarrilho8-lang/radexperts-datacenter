import { NextResponse } from 'next/server';
import { findUserByCredentials, makeToken } from '@/app/lib/users';
import { logActivity, extractIp } from '@/app/lib/activityLog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 400 });
    }

    const user = await findUserByCredentials(username, password);
    if (!user) {
      return NextResponse.json({ error: 'Usuário ou senha incorretos.' }, { status: 401 });
    }

    const token = makeToken(user);

    // Fire-and-forget — never block the login response
    logActivity({
      action:      'LOGIN',
      entity_type: 'session',
      entity_name: user.name || user.username,
      user_id:     user.id,
      user_name:   user.name || user.username,
      metadata:    { role: user.role, username: user.username },
      ip:          extractIp(request),
    });

    return NextResponse.json({ token, role: user.role, name: user.name, username: user.username });
  } catch (e: any) {
    return NextResponse.json({ error: 'Erro interno.', detail: e.message }, { status: 500 });
  }
}
