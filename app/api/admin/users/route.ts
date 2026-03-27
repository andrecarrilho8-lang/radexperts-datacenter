import { NextResponse } from 'next/server';
import { readUsers, writeUsers, hashPassword, parseToken, persistUsersToGitHub } from '@/app/lib/users';
import { randomUUID } from 'crypto';

function isAdmin(request: Request): boolean {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  const user = parseToken(token);
  return user?.role === 'TOTAL';
}

export async function GET(request: Request) {
  if (!isAdmin(request)) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
  const users = readUsers().map(({ password: _, ...u }) => u);
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  if (!isAdmin(request)) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });

  const { username, password, name, role } = await request.json();
  if (!username || !password || !name || !role) {
    return NextResponse.json({ error: 'Campos obrigatórios faltando.' }, { status: 400 });
  }

  const users = readUsers();
  if (users.find(u => u.username === username)) {
    return NextResponse.json({ error: 'Usuário já existe.' }, { status: 409 });
  }

  const newUser = {
    id: randomUUID(),
    username,
    password: hashPassword(password),
    name,
    role: role as 'TOTAL' | 'NORMAL',
    createdAt: new Date().toISOString(),
  };

  const updated = [...users, newUser];
  writeUsers(updated);
  await persistUsersToGitHub(updated); // permanent commit to GitHub

  const { password: _, ...safe } = newUser;
  return NextResponse.json({ user: safe });
}
