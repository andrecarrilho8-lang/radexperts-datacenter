import { NextResponse } from 'next/server';
import { findUserByCredentials, makeToken } from '@/app/lib/users';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 400 });
    }

    const user = findUserByCredentials(username, password);
    if (!user) {
      return NextResponse.json({ error: 'Usuário ou senha incorretos.' }, { status: 401 });
    }

    const token = makeToken(user);
    return NextResponse.json({ token, role: user.role, name: user.name, username: user.username });
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
