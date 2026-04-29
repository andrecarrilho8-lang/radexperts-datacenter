import { NextResponse } from 'next/server';
import { getUserById, deleteUserById, updateUserPassword, hashPassword, parseToken } from '@/app/lib/users';
import { logActivity, extractActor, extractIp } from '@/app/lib/activityLog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAdmin(request: Request): boolean {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  const user = parseToken(token);
  return user?.role === 'TOTAL';
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(request)) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });

  const { id } = await params;
  const target = await getUserById(id);

  if (!target) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
  if (target.username === 'andre') return NextResponse.json({ error: 'Não é possível remover o admin principal.' }, { status: 400 });

  await deleteUserById(id);

  logActivity({
    ...extractActor(request),
    action:      'USER_DELETED',
    entity_type: 'dashboard_user',
    entity_id:   id,
    entity_name: target.name || target.username,
    metadata:    { username: target.username, role: target.role },
    ip:          extractIp(request),
  });

  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(request)) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });

  const { id } = await params;
  const { password } = await request.json();
  if (!password) return NextResponse.json({ error: 'Senha obrigatória.' }, { status: 400 });

  const target = await getUserById(id);
  if (!target) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });

  await updateUserPassword(id, hashPassword(password));

  logActivity({
    ...extractActor(request),
    action:      'USER_PASSWORD_CHANGED',
    entity_type: 'dashboard_user',
    entity_id:   id,
    entity_name: target.name || target.username,
    metadata:    { username: target.username },
    ip:          extractIp(request),
  });

  return NextResponse.json({ success: true });
}
