/**
 * Neon Postgres client helper.
 * Uses @neondatabase/serverless which works in both edge and Node.js runtimes.
 */

import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | null = null;

export function getDb() {
  if (!_sql) {
    const url = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
    if (!url) throw new Error('POSTGRES_URL env var missing');
    _sql = neon(url);
  }
  return _sql;
}

/** Ensure the manual_students table exists. Call from a migration endpoint. */
export async function ensureSchema() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS manual_students (
      id          TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
      course_name TEXT    NOT NULL,
      name        TEXT    NOT NULL,
      email       TEXT    NOT NULL,
      phone       TEXT    NOT NULL DEFAULT '',
      entry_date  BIGINT  NOT NULL,
      payment_type TEXT   NOT NULL DEFAULT 'PIX',
      total_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
      installments       INTEGER       NOT NULL DEFAULT 1,
      installment_amount NUMERIC(12,2),
      installment_dates  JSONB NOT NULL DEFAULT '[]',
      notes       TEXT NOT NULL DEFAULT '',
      created_at  BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint,
      updated_at  BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS hidden_students (
      id          TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
      course_name TEXT    NOT NULL,
      email       TEXT    NOT NULL,
      created_at  BIGINT  NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint,
      UNIQUE (course_name, email)
    )
  `;
}
