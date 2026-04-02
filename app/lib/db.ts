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

/** Ensure webhook tables exist. Called automatically from the webhook endpoint. */
export async function ensureWebhookSchema() {
  const sql = getDb();

  // Raw event log — full payload preserved for audit/replay
  await sql`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id           TEXT   PRIMARY KEY DEFAULT gen_random_uuid()::text,
      event_type   TEXT   NOT NULL,
      transaction  TEXT,
      email        TEXT,
      product_name TEXT,
      payload      JSONB  NOT NULL,
      received_at  BIGINT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS webhook_events_email_idx ON webhook_events(email)`;
  await sql`CREATE INDEX IF NOT EXISTS webhook_events_tx_idx    ON webhook_events(transaction)`;

  // Enriched buyer profiles — upserted on every purchase event
  await sql`
    CREATE TABLE IF NOT EXISTS buyer_profiles (
      email              TEXT   PRIMARY KEY,
      name               TEXT,
      phone              TEXT,
      document           TEXT,
      country            TEXT,
      -- tracking from most recent purchase
      src                TEXT,
      sck                TEXT,
      utm_source         TEXT,
      utm_medium         TEXT,
      utm_campaign       TEXT,
      utm_content        TEXT,
      utm_term           TEXT,
      -- tracking from FIRST purchase (preserved for attribution)
      first_src          TEXT,
      first_sck          TEXT,
      first_utm_source   TEXT,
      first_utm_medium   TEXT,
      first_utm_campaign TEXT,
      first_utm_content  TEXT,
      first_utm_term     TEXT,
      -- purchase stats
      last_transaction   TEXT,
      last_product       TEXT,
      last_purchase_at   BIGINT,
      first_purchase_at  BIGINT,
      purchase_count     INTEGER NOT NULL DEFAULT 0,
      -- buyer persona / internal spreadsheet fields
      vendedor           TEXT,
      bp_valor           NUMERIC(12,2),
      bp_pagamento       TEXT,
      bp_modelo          TEXT,
      bp_parcela         NUMERIC(12,2),
      bp_primeira_parcela BIGINT,
      bp_ultimo_pagamento BIGINT,
      bp_proximo_pagamento BIGINT,
      bp_em_dia          TEXT,
      -- timestamps
      created_at         BIGINT NOT NULL,
      updated_at         BIGINT NOT NULL
    )
  `;

  // Safe migration for pre-existing tables (adds columns only if missing)
  await ensureBuyerPersonaColumns();
}

/** Adds buyer-persona columns to buyer_profiles if they don't exist yet.
 *  Safe to call multiple times — raw DDL per column. */
export async function ensureBuyerPersonaColumns() {
  const sql = getDb();
  const alters = [
    `ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS vendedor           TEXT`,
    `ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS bp_valor           NUMERIC(12,2)`,
    `ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS bp_pagamento       TEXT`,
    `ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS bp_modelo          TEXT`,
    `ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS bp_parcela         NUMERIC(12,2)`,
    `ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS bp_primeira_parcela BIGINT`,
    `ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS bp_ultimo_pagamento BIGINT`,
    `ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS bp_proximo_pagamento BIGINT`,
    `ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS bp_em_dia          TEXT`,
  ];
  for (const stmt of alters) {
    try { await sql.unsafe(stmt); } catch { /* already exists — ignore */ }
  }
}
