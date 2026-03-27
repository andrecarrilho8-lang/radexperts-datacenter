import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const TMP_FILE = '/tmp/users_10x.json';
const BUNDLE_FILE = path.join(process.cwd(), 'data', 'users.json');

// GitHub repo info (for permanent commits)
const GH_OWNER = 'andrecarrilho8-lang';
const GH_REPO  = '10x-dashboard';
const GH_PATH  = 'data/users.json';

export type UserRole = 'TOTAL' | 'NORMAL';

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

export function readUsers(): User[] {
  try {
    const raw = fs.readFileSync(TMP_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {}
  try {
    const raw = fs.readFileSync(BUNDLE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {}
  return [];
}

export function writeUsers(users: User[]): void {
  try { fs.writeFileSync(TMP_FILE, JSON.stringify(users, null, 2), 'utf-8'); } catch {}
}

/** Commits data/users.json to GitHub — makes changes permanent across deploys */
export async function persistUsersToGitHub(users: User[]): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return; // silently skip if token not set

  const api = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': '10x-dashboard-admin',
    Accept: 'application/vnd.github+json',
  };

  try {
    // Get current SHA of the file (required for update)
    const getRes = await fetch(api, { headers });
    const getJson = await getRes.json();
    const sha: string = getJson.sha;

    const content = Buffer.from(JSON.stringify(users, null, 2) + '\n').toString('base64');

    await fetch(api, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'chore: update users list [skip ci]',
        content,
        sha,
      }),
    });
  } catch {
    // Non-critical — /tmp still has the change for this session
  }
}

export function findUserByCredentials(username: string, password: string): User | null {
  const users = readUsers();
  const hashed = hashPassword(password);
  return users.find(u => u.username === username && u.password === hashed) || null;
}

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
