import { NextResponse } from 'next/server';
import {
  storeWebhookSale,
  extractUTMsFromPayload,
  calcAttributionStatus,
  getWebhookSales,
  type WebhookSale,
} from '@/app/lib/webhookStore';
import { invalidateSalesCache } from '@/app/lib/salesCache';
import { getDb, ensureWebhookSchema } from '@/app/lib/db';

export const runtime = 'nodejs';

// ── One-time schema boot ──────────────────────────────────────────────────────
let _schemaBoot = false;
async function bootSchema() {
  if (_schemaBoot) return;
  await ensureWebhookSchema();
  _schemaBoot = true;
}

/**
 * POST /api/hotmart/webhook
 *
 * Receives Hotmart Purchase Webhook v2.0.0 events.
 * Docs: https://developers.hotmart.com/docs/pt-BR/2.0.0/webhook/purchase-webhook/
 *
 * SECURITY: validates X-Hotmart-Hottok header.
 * ATTRIBUTION: extracts utm_source, utm_campaign, utm_medium, utm_content, utm_term
 *              via recursive payload search — trusts values exactly as received.
 */

const APPROVED_EVENTS = new Set([
  'PURCHASE_APPROVED',
  'PURCHASE_COMPLETE',
  'PURCHASE_CONFIRMED',
]);

export async function POST(request: Request) {
  /* ── Security ── */
  const hottok       = process.env.HOTMART_HOTTOK;
  const hottokHeader = request.headers.get('x-hotmart-hottok');

  if (hottok && hottokHeader !== hottok) {
    console.warn('[Hotmart Webhook] Hottok inválido recebido:', hottokHeader?.slice(0, 10));
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  /* ── Parse payload ── */
  let rawBody: string;
  let body: any;
  try {
    rawBody = await request.text();
    body    = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const event   = (body.event || '').toUpperCase();
  const eventId = body.id || `${Date.now()}`;



  /* ── Extract buyer/tracking data (needed for DB regardless of event type) ── */
  const d        = body.data     || {};
  const product  = d.product     || {};
  const buyer    = d.buyer       || {};
  const purchase = d.purchase    || {};
  const tracking = purchase.tracking || {};

  const buyerEmail    = (buyer.email || '').toLowerCase().trim();
  const buyerName     = buyer.name || buyer.first_name || '';
  const buyerPhone    = buyer.phone || buyer.checkout_phone || (buyer as any).cellphone || '';
  const buyerDocument = buyer.document || buyer.cpf || '';
  const buyerCountry  = buyer.address?.country || '';
  const productName   = product.name || '';
  const transaction   = purchase.transaction || body.id || '';
  const purchaseAt    = purchase.approved_date || purchase.order_date || Date.now();

  const src         = tracking.source       || '';
  const sck         = tracking.source_sck   || '';
  const utmSource   = tracking.utm_source   || '';
  const utmMedium   = tracking.utm_medium   || '';
  const utmCampaign = tracking.utm_campaign || '';
  const utmContent  = tracking.utm_content  || '';
  const utmTerm     = tracking.utm_term     || '';

  /* ── Persist to Neon (non-blocking — webhook response never delayed) ── */
  const now = Date.now();
  void (async () => {
    try {
      await bootSchema();
      const sql = getDb();

      // 1. Raw event log
      await sql`
        INSERT INTO webhook_events
          (id, event_type, transaction, email, product_name, payload, received_at)
        VALUES
          (gen_random_uuid()::text, ${event}, ${transaction || null},
           ${buyerEmail || null}, ${productName || null},
           ${JSON.stringify(body)}::jsonb, ${now})
      `;

      // 2. Buyer profile upsert (only if we have an email)
      if (buyerEmail) {
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
            ${buyerEmail},
            ${buyerName || null}, ${buyerPhone || null},
            ${buyerDocument || null}, ${buyerCountry || null},
            ${src || null}, ${sck || null},
            ${utmSource || null}, ${utmMedium || null}, ${utmCampaign || null},
            ${utmContent || null}, ${utmTerm || null},
            ${src || null}, ${sck || null},
            ${utmSource || null}, ${utmMedium || null}, ${utmCampaign || null},
            ${utmContent || null}, ${utmTerm || null},
            ${transaction || null}, ${productName || null}, ${purchaseAt},
            ${purchaseAt}, 1,
            ${now}, ${now}
          )
          ON CONFLICT (email) DO UPDATE SET
            name               = COALESCE(NULLIF(EXCLUDED.name, ''),     buyer_profiles.name),
            phone              = COALESCE(NULLIF(EXCLUDED.phone, ''),    buyer_profiles.phone),
            document           = COALESCE(NULLIF(EXCLUDED.document, ''), buyer_profiles.document),
            country            = COALESCE(NULLIF(EXCLUDED.country, ''),  buyer_profiles.country),
            src                = COALESCE(NULLIF(EXCLUDED.src, ''),      buyer_profiles.src),
            sck                = COALESCE(NULLIF(EXCLUDED.sck, ''),      buyer_profiles.sck),
            utm_source         = COALESCE(NULLIF(EXCLUDED.utm_source, ''),   buyer_profiles.utm_source),
            utm_medium         = COALESCE(NULLIF(EXCLUDED.utm_medium, ''),   buyer_profiles.utm_medium),
            utm_campaign       = COALESCE(NULLIF(EXCLUDED.utm_campaign, ''), buyer_profiles.utm_campaign),
            utm_content        = COALESCE(NULLIF(EXCLUDED.utm_content, ''),  buyer_profiles.utm_content),
            utm_term           = COALESCE(NULLIF(EXCLUDED.utm_term, ''),     buyer_profiles.utm_term),
            first_src          = COALESCE(buyer_profiles.first_src,          NULLIF(EXCLUDED.first_src, '')),
            first_sck          = COALESCE(buyer_profiles.first_sck,          NULLIF(EXCLUDED.first_sck, '')),
            first_utm_source   = COALESCE(buyer_profiles.first_utm_source,   NULLIF(EXCLUDED.first_utm_source, '')),
            first_utm_medium   = COALESCE(buyer_profiles.first_utm_medium,   NULLIF(EXCLUDED.first_utm_medium, '')),
            first_utm_campaign = COALESCE(buyer_profiles.first_utm_campaign, NULLIF(EXCLUDED.first_utm_campaign, '')),
            first_utm_content  = COALESCE(buyer_profiles.first_utm_content,  NULLIF(EXCLUDED.first_utm_content, '')),
            first_utm_term     = COALESCE(buyer_profiles.first_utm_term,     NULLIF(EXCLUDED.first_utm_term, '')),
            last_transaction   = EXCLUDED.last_transaction,
            last_product       = EXCLUDED.last_product,
            last_purchase_at   = GREATEST(buyer_profiles.last_purchase_at, EXCLUDED.last_purchase_at),
            first_purchase_at  = LEAST(buyer_profiles.first_purchase_at, EXCLUDED.first_purchase_at),
            purchase_count     = buyer_profiles.purchase_count + 1,
            updated_at         = ${now}
        `;

        // 3. Auto-attribute vendedor from sck_vendedor_map if SCK is present and vendedor not yet set
        if (sck) {
          const updated = await sql`
            UPDATE buyer_profiles bp
            SET
              vendedor   = svm.vendedor,
              updated_at = ${now}
            FROM sck_vendedor_map svm
            WHERE bp.email  = ${buyerEmail}
              AND bp.sck    = svm.sck
              AND (bp.vendedor IS NULL OR TRIM(bp.vendedor) = '')
            RETURNING bp.vendedor
          ` as any[];
          if (updated.length > 0) {
            console.log(`[Webhook] Vendedor atribuído automaticamente: ${buyerEmail} → ${updated[0].vendedor} (sck=${sck})`);
          }
        }
      }
    } catch (err: any) {
      console.error('[Webhook] Neon persist error:', err.message);
    }
  })();

  /* ── Only process approved purchases for sales dashboard ── */
  if (!APPROVED_EVENTS.has(event)) {
    return NextResponse.json({ success: true, ignored: event });
  }

  /* ── Extract remaining data from v2 payload (vars already extracted above) ── */
  // Identifiers
  const sale_id = transaction || body.id || `${Date.now()}`;

  // Product
  const product_id   = product.id   ?? 0;
  const product_name = productName;

  // Buyer
  const buyer_email = buyerEmail;
  const buyer_name  = buyerName;

  // Financial — purchase.full_price = total paid by buyer incl. fees
  const fullPrice = purchase.full_price || purchase.price || {};
  const amount    = typeof fullPrice.value === 'number'
    ? fullPrice.value
    : parseFloat(String(fullPrice.value || '0')) || 0;
  const currency  = fullPrice.currency_value || 'BRL';

  // Best-effort BRL amount (producer net preferred)
  const amountBrl: number =
    (purchase as any).producer_net_brl ??
    (purchase as any).producer_net ??
    (currency === 'BRL' ? amount : 0);

  // Timestamps
  const approvedDateMs = purchase.approved_date
    ? (typeof purchase.approved_date === 'number' ? purchase.approved_date : Date.parse(purchase.approved_date))
    : Date.now();
  const orderDate = purchase.order_date || '';

  /* ── UTM extraction (trusts payload values exactly as received) ── */
  const utms = extractUTMsFromPayload(body);

  const attribution_status = calcAttributionStatus(
    utms.utm_source,
    utms.utm_campaign,
    utms.utm_medium,
    utms.utm_content,
    utms.utm_term,
  );

  /* ── Build sale record ── */
  const sale: WebhookSale = {
    // Identifiers
    sale_id,
    event,
    receivedAt: Date.now(),
    source: 'webhook',

    // Product
    product_id,
    product_name,

    // Buyer
    buyer_email,
    buyer_name,

    // Financial
    amount,
    amountBrl,
    currency,

    // Timestamps
    approvedDateMs,
    orderDate,

    // Raw Hotmart origin fields
    raw_src:  utms.raw_src,
    raw_sck:  utms.raw_sck,
    raw_xcod: utms.raw_xcod,

    // UTM fields (exactly as found in payload, no transformation)
    utm_source:   utms.utm_source,
    utm_campaign: utms.utm_campaign,
    utm_medium:   utms.utm_medium,
    utm_content:  utms.utm_content,
    utm_term:     utms.utm_term,

    // Attribution quality
    attribution_status,

    // Dashboard-facing normalised fields
    origem:               utms.utm_source,
    campanha:             utms.utm_campaign,
    conjunto_de_anuncios: utms.utm_medium,
    anuncio:              utms.utm_content,

    // Full raw payload for auditability
    raw_payload: body,
  };

  storeWebhookSale(sale);
  invalidateSalesCache();


  return NextResponse.json({
    success:            true,
    sale_id,
    event,
    attribution_status,
    utm_source:         utms.utm_source,
    utm_campaign:       utms.utm_campaign,
    utm_medium:         utms.utm_medium,
    utm_content:        utms.utm_content,
    utm_term:           utms.utm_term,
  });
}

/**
 * GET /api/hotmart/webhook
 * Public diagnostic: returns count + attribution breakdown.
 * Full sale list requires ?key=HOTTOK.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key    = searchParams.get('key');
  const hottok = process.env.HOTMART_HOTTOK || '';

  const sales = getWebhookSales();

  // Attribution breakdown (always public — no sensitive data)
  const attrBreakdown = { complete: 0, partial: 0, missing: 0 };
  sales.forEach(s => { attrBreakdown[s.attribution_status]++; });

  const base = {
    count: sales.length,
    attrBreakdown,
    // First 8 chars only — helps diagnose env var mismatch between local and Vercel
    hottok_prefix_vercel: hottok ? `${hottok.slice(0, 8)}… (${hottok.length} chars)` : 'NOT_SET',
    key_matches: !!hottok && key === hottok,
  };

  // Full details only when key matches
  if (!hottok || key === hottok) {
    return NextResponse.json({
      ...base,
      sales: sales.map(s => ({
        sale_id:            s.sale_id,
        event:              s.event,
        receivedAt:         new Date(s.receivedAt).toISOString(),
        product_name:       s.product_name,
        amountBrl:          s.amountBrl,
        attribution_status: s.attribution_status,
        utm_source:         s.utm_source,
        utm_campaign:       s.utm_campaign,
        utm_medium:         s.utm_medium,
        utm_content:        s.utm_content,
        utm_term:           s.utm_term,
        raw_src:            s.raw_src,
        raw_sck:            s.raw_sck,
        raw_xcod:           s.raw_xcod,
      })),
    });
  }

  // Return base stats only (key didn't match — no sensitive list)
  return NextResponse.json({ ...base, sales: [] });
}
