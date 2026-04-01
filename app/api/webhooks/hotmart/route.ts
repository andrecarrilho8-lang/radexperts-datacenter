import { NextResponse } from 'next/server';
import { getDb, ensureWebhookSchema } from '@/app/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ── Schema boot flag (only run once per cold start) ──────────────────────────
let schemaReady = false;
async function boot() {
  if (!schemaReady) { await ensureWebhookSchema(); schemaReady = true; }
}

// ── Hotmart HotTok verification ───────────────────────────────────────────────
// Hotmart sends the configured HotTok in the x-hotmart-hottok header.
// Set HOTMART_HOTTOK in your Vercel env vars (same value as in Hotmart dashboard).
const WEBHOOK_SECRET = process.env.HOTMART_HOTTOK;

function verifyToken(req: Request): boolean {
  if (!WEBHOOK_SECRET) return true; // skip verification if not configured (dev mode)
  const token = req.headers.get('x-hotmart-hottok') || '';
  return token === WEBHOOK_SECRET;
}

// ── Extract structured fields from Hotmart webhook payload ────────────────────
function extractFields(payload: any) {
  const data     = payload?.data     || {};
  const buyer    = data.buyer        || {};
  const purchase = data.purchase     || {};
  const product  = data.product      || {};
  const tracking = purchase.tracking || {};

  const email       = (buyer.email    || '').toLowerCase().trim();
  const name        = buyer.name      || '';
  const phone       = buyer.phone     || buyer.checkout_phone || '';
  const document    = buyer.document  || buyer.cpf || '';
  const country     = buyer.address?.country || '';

  const transaction = purchase.transaction || '';
  const purchaseAt  = purchase.approved_date || purchase.order_date || Date.now();

  const src         = tracking.source      || '';
  const sck         = tracking.source_sck  || '';
  const utmSource   = tracking.utm_source  || '';
  const utmMedium   = tracking.utm_medium  || '';
  const utmCampaign = tracking.utm_campaign || '';
  const utmContent  = tracking.utm_content  || '';
  const utmTerm     = tracking.utm_term     || '';

  const productName = product.name || '';
  const eventType   = payload.event || 'UNKNOWN';

  return {
    email, name, phone, document, country,
    transaction, purchaseAt,
    src, sck, utmSource, utmMedium, utmCampaign, utmContent, utmTerm,
    productName, eventType,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  // 1. Verify HotTok
  if (!verifyToken(request)) {
    console.warn('[webhook] Invalid HotTok token');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse body
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 3. Ensure tables exist (idempotent, fast after first call)
  try { await boot(); } catch (e: any) {
    console.error('[webhook] Schema error:', e.message);
    // Don't fail the webhook — Hotmart will retry
    return NextResponse.json({ ok: false, error: 'DB schema error' }, { status: 500 });
  }

  const f = extractFields(payload);
  const now = Date.now();
  const sql = getDb();

  // 4. Save raw event (always, regardless of event type)
  try {
    await sql`
      INSERT INTO webhook_events (id, event_type, transaction, email, product_name, payload, received_at)
      VALUES (
        gen_random_uuid()::text,
        ${f.eventType},
        ${f.transaction || null},
        ${f.email || null},
        ${f.productName || null},
        ${JSON.stringify(payload)}::jsonb,
        ${now}
      )
    `;
  } catch (e: any) {
    console.error('[webhook] Failed to save event:', e.message);
  }

  // 5. Upsert buyer profile (only for purchase events with a valid email)
  const PURCHASE_EVENTS = new Set([
    'PURCHASE_COMPLETE', 'PURCHASE_APPROVED', 'PURCHASE_CONFIRMED',
    'PURCHASE_BILLET_PRINTED', 'PURCHASE_PROTEST', 'PURCHASE_REFUNDED',
    'PURCHASE_CANCELED', 'PURCHASE_CHARGEBACK',
    'SUBSCRIPTION_PURCHASE', 'SWITCH_PLAN',
  ]);

  if (f.email && PURCHASE_EVENTS.has(f.eventType)) {
    try {
      await sql`
        INSERT INTO buyer_profiles (
          email, name, phone, document, country,
          src, sck, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
          first_src, first_sck, first_utm_source, first_utm_medium,
          first_utm_campaign, first_utm_content, first_utm_term,
          last_transaction, last_product, last_purchase_at,
          first_purchase_at, purchase_count,
          created_at, updated_at
        ) VALUES (
          ${f.email},
          ${f.name || null},
          ${f.phone || null},
          ${f.document || null},
          ${f.country || null},
          ${f.src || null}, ${f.sck || null},
          ${f.utmSource || null}, ${f.utmMedium || null}, ${f.utmCampaign || null},
          ${f.utmContent || null}, ${f.utmTerm || null},
          -- first_* = same as current on INSERT
          ${f.src || null}, ${f.sck || null},
          ${f.utmSource || null}, ${f.utmMedium || null}, ${f.utmCampaign || null},
          ${f.utmContent || null}, ${f.utmTerm || null},
          ${f.transaction || null}, ${f.productName || null}, ${f.purchaseAt},
          ${f.purchaseAt}, 1,
          ${now}, ${now}
        )
        ON CONFLICT (email) DO UPDATE SET
          -- update contact info if we have better data
          name               = COALESCE(NULLIF(EXCLUDED.name, ''),              buyer_profiles.name),
          phone              = COALESCE(NULLIF(EXCLUDED.phone, ''),             buyer_profiles.phone),
          document           = COALESCE(NULLIF(EXCLUDED.document, ''),          buyer_profiles.document),
          country            = COALESCE(NULLIF(EXCLUDED.country, ''),           buyer_profiles.country),
          -- latest purchase tracking (always overwrite)
          src                = COALESCE(NULLIF(EXCLUDED.src, ''),               buyer_profiles.src),
          sck                = COALESCE(NULLIF(EXCLUDED.sck, ''),               buyer_profiles.sck),
          utm_source         = COALESCE(NULLIF(EXCLUDED.utm_source, ''),        buyer_profiles.utm_source),
          utm_medium         = COALESCE(NULLIF(EXCLUDED.utm_medium, ''),        buyer_profiles.utm_medium),
          utm_campaign       = COALESCE(NULLIF(EXCLUDED.utm_campaign, ''),      buyer_profiles.utm_campaign),
          utm_content        = COALESCE(NULLIF(EXCLUDED.utm_content, ''),       buyer_profiles.utm_content),
          utm_term           = COALESCE(NULLIF(EXCLUDED.utm_term, ''),          buyer_profiles.utm_term),
          -- first_* = only set if currently NULL (preserve first-touch attribution)
          first_src          = COALESCE(buyer_profiles.first_src,          NULLIF(EXCLUDED.first_src, '')),
          first_sck          = COALESCE(buyer_profiles.first_sck,          NULLIF(EXCLUDED.first_sck, '')),
          first_utm_source   = COALESCE(buyer_profiles.first_utm_source,   NULLIF(EXCLUDED.first_utm_source, '')),
          first_utm_medium   = COALESCE(buyer_profiles.first_utm_medium,   NULLIF(EXCLUDED.first_utm_medium, '')),
          first_utm_campaign = COALESCE(buyer_profiles.first_utm_campaign, NULLIF(EXCLUDED.first_utm_campaign, '')),
          first_utm_content  = COALESCE(buyer_profiles.first_utm_content,  NULLIF(EXCLUDED.first_utm_content, '')),
          first_utm_term     = COALESCE(buyer_profiles.first_utm_term,     NULLIF(EXCLUDED.first_utm_term, '')),
          -- stats
          last_transaction   = EXCLUDED.last_transaction,
          last_product       = EXCLUDED.last_product,
          last_purchase_at   = GREATEST(buyer_profiles.last_purchase_at, EXCLUDED.last_purchase_at),
          first_purchase_at  = LEAST(buyer_profiles.first_purchase_at, EXCLUDED.first_purchase_at),
          purchase_count     = buyer_profiles.purchase_count + 1,
          updated_at         = ${now}
      `;
    } catch (e: any) {
      console.error('[webhook] Failed to upsert buyer_profile:', e.message);
    }
  }

  // Always return 200 so Hotmart doesn't retry
  return NextResponse.json({ ok: true, event: f.eventType, email: f.email || null });
}

// ── GET — health check / list recent events ────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit  = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const email  = searchParams.get('email') || '';

  try {
    await boot();
    const sql = getDb();
    const rows = email
      ? (await sql`SELECT id, event_type, transaction, email, product_name, received_at
                   FROM webhook_events WHERE email = ${email.toLowerCase()}
                   ORDER BY received_at DESC LIMIT ${limit}`) as any[]
      : (await sql`SELECT id, event_type, transaction, email, product_name, received_at
                   FROM webhook_events ORDER BY received_at DESC LIMIT ${limit}`) as any[];

    const profileRows = email
      ? (await sql`SELECT * FROM buyer_profiles WHERE email = ${email.toLowerCase()} LIMIT 1`) as any[]
      : [];

    return NextResponse.json({
      events:  rows,
      profile: profileRows[0] || null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
