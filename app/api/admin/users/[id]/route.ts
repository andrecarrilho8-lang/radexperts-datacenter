import { NextResponse } from 'next/server';
import { getUserById, deleteUserById, updateUserPassword, hashPassword, parseToken } from '@/app/lib/users';

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
  return NextResponse.json({ success: true });
}
