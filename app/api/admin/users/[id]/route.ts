import { NextResponse } from 'next/server';
import { readUsers, writeUsers, hashPassword, parseToken, persistUsersToGitHub } from '@/app/lib/users';

function isAdmin(request: Request): boolean {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  const user = parseToken(token);
  return user?.role === 'TOTAL';
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(request)) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });

  const { id } = await params;
  const users = readUsers();
  const target = users.find(u => u.id === id);

  if (!target) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
  if (target.username === 'adv10x') return NextResponse.json({ error: 'Não é possível remover o admin principal.' }, { status: 400 });

  const updated = users.filter(u => u.id !== id);
  writeUsers(updated);
  await persistUsersToGitHub(updated);

  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(request)) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });

  const { id } = await params;
  const { password } = await request.json();
  if (!password) return NextResponse.json({ error: 'Senha obrigatória.' }, { status: 400 });

  const users = readUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });

  users[idx].password = hashPassword(password);
  writeUsers(users);
  await persistUsersToGitHub(users);

  return NextResponse.json({ success: true });
}
