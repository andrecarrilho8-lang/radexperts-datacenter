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
  // Additive migrations — safe to run on existing tables
  await sql`ALTER TABLE manual_students ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL'`;
  await sql`ALTER TABLE manual_students ADD COLUMN IF NOT EXISTS down_payment NUMERIC(12,2) NOT NULL DEFAULT 0`;
  await sql`
    CREATE TABLE IF NOT EXISTS hidden_students (
      id          TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
      course_name TEXT    NOT NULL,
      email       TEXT    NOT NULL,
      created_at  BIGINT  NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint,
      UNIQUE (course_name, email)
    )
  `;

  // Auto-migrate legacy BP spreadsheet fields → installment_dates[]
  // Runs only on rows still missing installment data — fully idempotent.
  await migrateInstallmentDates();
}

/**
 * addMonths — adds N calendar months to a timestamp (ms),
 * clamping the day-of-month to avoid end-of-month overflows.
 */
function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  const targetMonth = d.getMonth() + months;
  d.setMonth(targetMonth);
  // If setMonth overflowed (e.g. Jan 31 + 1 month → Mar 3), clamp back
  if (d.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    d.setDate(0); // last day of previous month
  }
  return d.getTime();
}

/**
 * Reads all manual_students that still have installment_dates = '[]' and
 * reconstructs the installment schedule from the legacy buyer_profiles BP fields.
 * Only runs on rows that have NOT yet been migrated — safe to call on every boot.
 */
export async function migrateInstallmentDates() {
  const sql = getDb();

  // Fetch only unprocessed rows (installment_dates still empty)
  const rows = (await sql`
    SELECT
      ms.id,
      ms.email,
      ms.entry_date,
      ms.payment_type,
      ms.total_amount,
      ms.installments,
      ms.installment_amount,
      ms.down_payment,
      ms.installment_dates,
      bp.bp_primeira_parcela,
      bp.bp_ultimo_pagamento,
      bp.bp_proximo_pagamento,
      bp.bp_parcela
    FROM manual_students ms
    LEFT JOIN buyer_profiles bp ON LOWER(bp.email) = LOWER(ms.email)
    WHERE ms.installment_dates = '[]'::jsonb
       OR ms.installment_dates IS NULL
  `) as any[];

  if (rows.length === 0) return; // nothing to do

  const now = Date.now();

  for (const row of rows) {
    try {
      const n          = Math.max(1, Number(row.installments) || 1);
      const totalAmt   = Number(row.total_amount)  || 0;
      const downAmt    = Number(row.down_payment)  || 0;
      const entryMs    = Number(row.entry_date)    || now;

      // --- 1. Determine installment amount (bp_parcela wins if present) ---
      const bpParcela  = Number(row.bp_parcela) || 0;
      const calcAmt    = n > 1
        ? Math.max(0, totalAmt - downAmt) / n
        : totalAmt;
      const instAmt    = bpParcela > 0 ? bpParcela : (Number(row.installment_amount) || calcAmt);

      // --- 2. Determine start date for schedule ---
      const startMs    = Number(row.bp_primeira_parcela) > 0
        ? Number(row.bp_primeira_parcela)
        : entryMs; // fallback: use entry date

      // --- 3. Determine last paid date ---
      const lastPaidMs = Number(row.bp_ultimo_pagamento) || 0;

      // --- 4. Infer how many installments are paid ---
      let paidCount = 0;

      if (n === 1) {
        // Single payment (PIX à vista): mark paid if we have bp_ultimo_pagamento
        // or if payment_type is PIX (implies immediate payment)
        const isPix = (row.payment_type || '').toUpperCase().includes('PIX');
        paidCount = (lastPaidMs > 0 || isPix) ? 1 : 0;
      } else if (lastPaidMs > 0) {
        // Count how many scheduled due dates are <= bp_ultimo_pagamento
        for (let i = 0; i < n; i++) {
          const dueMs = addMonths(startMs, i);
          // Add a 5-day grace window to account for late payments
          if (dueMs <= lastPaidMs + 5 * 24 * 60 * 60 * 1000) {
            paidCount++;
          } else {
            break;
          }
        }
        // Safety cap
        paidCount = Math.min(paidCount, n);
      }

      // --- 5. Build installment_dates[] ---
      const installmentDates: Array<{
        due_ms: number;
        paid: boolean;
        paid_ms: number | null;
      }> = [];

      for (let i = 0; i < n; i++) {
        const dueMs = addMonths(startMs, i);
        const paid  = i < paidCount;
        installmentDates.push({
          due_ms:  dueMs,
          paid,
          // For paid installments: last_paid for the final one, monthly dates for earlier ones
          paid_ms: paid
            ? (i === paidCount - 1 && lastPaidMs > 0 ? lastPaidMs : dueMs)
            : null,
        });
      }

      // --- 6. Persist ---
      await sql`
        UPDATE manual_students SET
          installment_dates  = ${JSON.stringify(installmentDates)}::jsonb,
          installment_amount = ${instAmt},
          updated_at         = ${now}
        WHERE id = ${row.id}
      `;
    } catch (err) {
      // Log but don't crash — skip this row and continue with others
      console.warn(`[migrateInstallmentDates] skipped row ${row.id}:`, err);
    }
  }
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
      notes              TEXT,
      -- timestamps
      created_at         BIGINT NOT NULL,
      updated_at         BIGINT NOT NULL
    )
  `;

  // Safe migration for pre-existing tables (adds columns only if missing)
  await ensureBuyerPersonaColumns();

  // SCK → Vendedor mapping table
  await sql`
    CREATE TABLE IF NOT EXISTS sck_vendedor_map (
      sck        TEXT PRIMARY KEY,
      vendedor   TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
      updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
    )
  `;
}

/** Adds buyer-persona columns to buyer_profiles if they don't exist yet (idempotent). */
export async function ensureBuyerPersonaColumns() {
  const sql = getDb();
  try { await sql`ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS vendedor           TEXT`; } catch {}
  try { await sql`ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS bp_valor           NUMERIC(12,2)`; } catch {}
  try { await sql`ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS bp_pagamento       TEXT`; } catch {}
  try { await sql`ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS bp_modelo          TEXT`; } catch {}
  try { await sql`ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS bp_parcela         NUMERIC(12,2)`; } catch {}
  try { await sql`ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS bp_primeira_parcela BIGINT`; } catch {}
  try { await sql`ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS bp_ultimo_pagamento BIGINT`; } catch {}
  try { await sql`ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS bp_proximo_pagamento BIGINT`; } catch {}
  try { await sql`ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS bp_em_dia          TEXT`; } catch {}
  try { await sql`ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS notes              TEXT`; } catch {}
}
