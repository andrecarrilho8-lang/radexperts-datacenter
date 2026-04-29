import { NextResponse } from 'next/server';
import { getUsers, createUser, hashPassword, parseToken } from '@/app/lib/users';
import { randomUUID } from 'crypto';
import { logActivity, extractActor, extractIp } from '@/app/lib/activityLog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAdmin(request: Request): boolean {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  const user = parseToken(token);
  return user?.role === 'TOTAL';
}

export async function GET(request: Request) {
  if (!isAdmin(request)) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });

  const users = await getUsers();
  const safe = users.map(({ password: _, ...u }) => u);
  return NextResponse.json({ users: safe });
}

export async function POST(request: Request) {
  if (!isAdmin(request)) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });

  const { username, password, name, role } = await request.json();
  if (!username || !password || !name || !role) {
    return NextResponse.json({ error: 'Campos obrigatórios faltando.' }, { status: 400 });
  }

  // Check for duplicate username
  const existing = await getUsers();
  if (existing.find(u => u.username === username)) {
    return NextResponse.json({ error: 'Usuário já existe.' }, { status: 409 });
  }

  try {
    const newUser = await createUser({
      id:       randomUUID(),
      username,
      password: hashPassword(password),
      name,
      role: role as 'TOTAL' | 'NORMAL' | 'TRAFEGO' | 'COMERCIAL',
    });

    const { password: _, ...safe } = newUser;

    logActivity({
      ...extractActor(request),
      action:      'USER_CREATED',
      entity_type: 'dashboard_user',
      entity_id:   newUser.id,
      entity_name: newUser.name || newUser.username,
      metadata:    { username: newUser.username, role: newUser.role },
      ip:          extractIp(request),
    });

    return NextResponse.json({ user: safe });
  } catch (e: any) {
    if (e.message?.includes('duplicate') || e.message?.includes('unique')) {
      return NextResponse.json({ error: 'Usuário já existe.' }, { status: 409 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
