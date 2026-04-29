/**
 * activityLog.ts
 * Central utility for recording user actions in the activity_logs table.
 * Call logActivity() from any API route after a successful mutation.
 */

import { getDb } from '@/app/lib/db';
import { parseToken } from '@/app/lib/users';

export type ActivityAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'STUDENT_CREATED'
  | 'STUDENT_UPDATED'
  | 'STUDENT_DELETED'
  | 'INSTALLMENT_PAID'
  | 'STUDENT_HIDDEN'
  | 'STUDENT_MERGED'
  | 'USER_CREATED'
  | 'USER_DELETED'
  | 'USER_PASSWORD_CHANGED'
  | 'CSV_IMPORTED'
  | 'MANUAL_PAYMENT_CREATED'
  | 'PAYMENT_STATUS_CHANGED';

export interface LogEntry {
  action:      ActivityAction;
  entity_type: string;          // 'manual_student' | 'user' | 'session' | etc.
  entity_id?:  string | null;
  entity_name?: string | null;  // human-readable (nome do aluno, username, etc.)
  metadata?:   Record<string, any>;
  ip?:         string | null;
  // actor — who did it (can be pre-parsed or extracted from token)
  user_id?:    string;
  user_name?:  string;
}

/* ── Schema bootstrap (idempotent) ─────────────────────────────────────────── */
let _schemaReady = false;

export async function ensureActivityLogSchema() {
  if (_schemaReady) return;
  try {
    const sql = getDb();
    await sql`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id          TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id     TEXT    NOT NULL DEFAULT '',
        user_name   TEXT    NOT NULL DEFAULT 'Sistema',
        action      TEXT    NOT NULL,
        entity_type TEXT    NOT NULL DEFAULT '',
        entity_id   TEXT,
        entity_name TEXT,
        metadata    JSONB   NOT NULL DEFAULT '{}',
        ip          TEXT,
        created_at  BIGINT  NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS activity_logs_created_idx ON activity_logs(created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS activity_logs_action_idx  ON activity_logs(action)`;
    await sql`CREATE INDEX IF NOT EXISTS activity_logs_user_idx    ON activity_logs(user_id)`;
    _schemaReady = true;
  } catch { /* non-fatal — logging should never crash the app */ }
}

/* ── Main logging function ─────────────────────────────────────────────────── */
export async function logActivity(entry: LogEntry): Promise<void> {
  try {
    await ensureActivityLogSchema();
    const sql = getDb();
    await sql`
      INSERT INTO activity_logs
        (user_id, user_name, action, entity_type, entity_id, entity_name, metadata, ip)
      VALUES (
        ${entry.user_id   ?? ''},
        ${entry.user_name ?? 'Sistema'},
        ${entry.action},
        ${entry.entity_type},
        ${entry.entity_id   ?? null},
        ${entry.entity_name ?? null},
        ${JSON.stringify(entry.metadata ?? {})}::jsonb,
        ${entry.ip ?? null}
      )
    `;
  } catch (err) {
    // Never throw — logging failures must not break the main action
    console.warn('[activityLog] failed to write log:', err);
  }
}

/* ── Helper: extract actor from Authorization header or cookie ─────────────── */
export function extractActor(request: Request): { user_id: string; user_name: string } {
  try {
    // Try Authorization: Bearer <token>
    const auth  = request.headers.get('Authorization') || '';
    const token = auth.replace('Bearer ', '').trim()
      || request.headers.get('x-auth-token')
      || '';

    if (token) {
      const parsed = parseToken(token);
      if (parsed) return { user_id: parsed.id, user_name: parsed.name || parsed.username };
    }
  } catch { /* ignore */ }
  return { user_id: '', user_name: 'Desconhecido' };
}

/* ── Helper: extract real client IP (Vercel + proxies) ────────────────────── */
export function extractIp(request: Request): string {
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
