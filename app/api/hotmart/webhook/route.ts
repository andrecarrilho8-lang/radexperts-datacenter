import { NextResponse } from 'next/server';
import {
  storeWebhookSale,
  extractUTMsFromPayload,
  calcAttributionStatus,
  getWebhookSales,
  type WebhookSale,
} from '@/app/lib/webhookStore';
import { invalidateSalesCache } from '@/app/lib/salesCache';

export const runtime = 'nodejs';

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

  console.log(`[Hotmart Webhook] Recebido: event=${event} id=${eventId}`);

  /* ── Only process approved purchases ── */
  if (!APPROVED_EVENTS.has(event)) {
    console.log(`[Hotmart Webhook] Ignorado: ${event}`);
    return NextResponse.json({ success: true, ignored: event });
  }

  /* ── Extract data from v2 payload ── */
  const d        = body.data     || {};
  const product  = d.product     || {};
  const buyer    = d.buyer       || {};
  const purchase = d.purchase    || {};

  // Identifiers
  const sale_id = purchase.transaction || body.id || `${Date.now()}`;

  // Product
  const product_id   = product.id   ?? 0;
  const product_name = product.name || '';

  // Buyer
  const buyer_email = buyer.email      || '';
  const buyer_name  = buyer.name       || buyer.first_name || '';

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

  await storeWebhookSale(sale);
  invalidateSalesCache();

  console.log(
    `[Hotmart Webhook] Armazenado: ${sale_id} | ${product_name} | R$${amountBrl.toFixed(2)}` +
    ` | attribution=${attribution_status}` +
    ` | utm_campaign="${utms.utm_campaign}" utm_medium="${utms.utm_medium}"` +
    ` | raw_src="${utms.raw_src}" raw_sck="${utms.raw_sck}"`,
  );

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

  const sales = await getWebhookSales();

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
