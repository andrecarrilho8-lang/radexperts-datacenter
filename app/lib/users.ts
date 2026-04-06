/**
 * users.ts — persistent user management via Neon PostgreSQL.
 *
 * Previous implementation used /tmp/users_10x.json + GitHub commits.
 * That approach was unreliable on Vercel (ephemeral /tmp, no GITHUB_TOKEN).
 * Now all users live in the dashboard_users table in the same Neon DB used
 * by manual_students, buyer_profiles, etc.
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { getDb } from '@/app/lib/db';

// Bundled seed file — used only to populate the DB on first boot
const BUNDLE_FILE = path.join(process.cwd(), 'data', 'users.json');

export type UserRole = 'TOTAL' | 'NORMAL' | 'TRAFEGO' | 'COMERCIAL';

export interface User {
  id: string;
  username: string;
  password: string;
  role: UserRole;
  name: string;
  createdAt: string;
}

export function hashPassword(pwd: string): string {
  return createHash('sha256').update(pwd).digest('hex');
}

// ── Table bootstrap ──────────────────────────────────────────────────────────

let _tableReady = false;

async function ensureUsersTable(): Promise<void> {
  if (_tableReady) return;
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS dashboard_users (
      id         TEXT PRIMARY KEY,
      username   TEXT NOT NULL UNIQUE,
      password   TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'NORMAL',
      name       TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT NOW()::text
    )
  `;

  // Seed from bundled data/users.json if table is empty
  const countRes = await sql`SELECT COUNT(*)::int AS cnt FROM dashboard_users`;
  if ((countRes[0] as any).cnt === 0) {
    try {
      const raw = fs.readFileSync(BUNDLE_FILE, 'utf-8');
      const seedUsers: User[] = JSON.parse(raw);
      for (const u of seedUsers) {
        await sql`
          INSERT INTO dashboard_users (id, username, password, role, name, created_at)
          VALUES (${u.id}, ${u.username}, ${u.password}, ${u.role ?? 'NORMAL'}, ${u.name}, ${u.createdAt})
          ON CONFLICT (username) DO NOTHING
        `;
      }
    } catch { /* non-fatal — table will just be empty until first admin creates users */ }
  }

  _tableReady = true;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

function rowToUser(r: any): User {
  return {
    id:        r.id,
    username:  r.username,
    password:  r.password,
    role:      r.role as UserRole,
    name:      r.name,
    createdAt: r.created_at,
  };
}

export async function getUsers(): Promise<User[]> {
  await ensureUsersTable();
  const sql = getDb();
  const rows = await sql`SELECT * FROM dashboard_users ORDER BY created_at ASC`;
  return (rows as any[]).map(rowToUser);
}

export async function findUserByCredentials(username: string, password: string): Promise<User | null> {
  await ensureUsersTable();
  const sql = getDb();
  const hashed = hashPassword(password);
  const rows = await sql`
    SELECT * FROM dashboard_users
    WHERE username = ${username} AND password = ${hashed}
    LIMIT 1
  `;
  return rows.length > 0 ? rowToUser(rows[0]) : null;
}

export async function createUser(user: {
  id: string; username: string; password: string; role: UserRole; name: string;
}): Promise<User> {
  await ensureUsersTable();
  const sql = getDb();
  const now = new Date().toISOString();
  const rows = await sql`
    INSERT INTO dashboard_users (id, username, password, role, name, created_at)
    VALUES (${user.id}, ${user.username}, ${user.password}, ${user.role}, ${user.name}, ${now})
    RETURNING *
  `;
  return rowToUser(rows[0]);
}

export async function deleteUserById(id: string): Promise<void> {
  await ensureUsersTable();
  const sql = getDb();
  await sql`DELETE FROM dashboard_users WHERE id = ${id}`;
}

export async function updateUserPassword(id: string, hashedPassword: string): Promise<void> {
  await ensureUsersTable();
  const sql = getDb();
  await sql`UPDATE dashboard_users SET password = ${hashedPassword} WHERE id = ${id}`;
}

export async function getUserById(id: string): Promise<User | null> {
  await ensureUsersTable();
  const sql = getDb();
  const rows = await sql`SELECT * FROM dashboard_users WHERE id = ${id} LIMIT 1`;
  return rows.length > 0 ? rowToUser(rows[0]) : null;
}

// ── Token helpers (stateless — no DB needed) ─────────────────────────────────

export function makeToken(user: User): string {
  const payload = { id: user.id, username: user.username, role: user.role, name: user.name };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

export function parseToken(token: string): { id: string; username: string; role: UserRole; name: string } | null {
  try {
    return JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}
