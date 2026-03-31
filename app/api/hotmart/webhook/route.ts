import { NextResponse } from 'next/server';
import { storeWebhookSale, parseHotmartOrigin, type WebhookSale } from '@/app/lib/webhookStore';
import { invalidateSalesCache } from '@/app/lib/salesCache';

export const runtime = 'nodejs';

/**
 * Hotmart Purchase Webhook v2.0.0
 * https://developers.hotmart.com/docs/pt-BR/2.0.0/webhook/purchase-webhook/
 *
 * Events stored: PURCHASE_APPROVED, PURCHASE_COMPLETE, PURCHASE_CONFIRMED
 * Events ignored: PURCHASE_CANCELED, PURCHASE_REFUNDED, PURCHASE_CHARGEBACK,
 *                 PURCHASE_BILLET_PRINTED, PURCHASE_EXPIRED, PURCHASE_DELAYED, PURCHASE_PROTEST
 *
 * Security: X-Hotmart-Hottok header validated against HOTMART_HOTTOK env var.
 */

const APPROVED_EVENTS = new Set([
  'PURCHASE_APPROVED',
  'PURCHASE_COMPLETE',
  'PURCHASE_CONFIRMED',
]);

export async function POST(request: Request) {
  /* ── Security ── */
  const hottok = process.env.HOTMART_HOTTOK;
  const hottokHeader = request.headers.get('x-hotmart-hottok');

  if (hottok && hottokHeader !== hottok) {
    console.warn('[Hotmart Webhook] Hottok inválido:', hottokHeader);
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  console.log('[Hotmart Webhook] Evento recebido:', body.event, '| ID:', body.id);

  /* ── Only process approved purchases ── */
  const event = (body.event || '').toUpperCase();
  if (!APPROVED_EVENTS.has(event)) {
    console.log(`[Hotmart Webhook] Evento ignorado: ${event}`);
    return NextResponse.json({ success: true, ignored: event });
  }

  /* ── Extract data from webhook v2 payload ── */
  const d = body.data || {};

  // Product info
  const product = d.product || {};
  const productName = product.name || '';
  const productId   = product.id   || 0;

  // Buyer info
  const buyer     = d.buyer || {};
  const buyerEmail = buyer.email     || '';
  const buyerName  = buyer.name      || buyer.first_name || '';

  // Purchase info
  const purchase = d.purchase || {};
  const transaction    = purchase.transaction || body.id || `${Date.now()}`;
  const status         = (purchase.status || '').toUpperCase();
  const orderDate      = purchase.order_date  || '';
  const approvedDateMs = purchase.approved_date || Date.now();

  // Price (purchase.full_price = total paid by buyer incl. fees)
  const fullPrice = purchase.full_price || purchase.price || {};
  const amount    = typeof fullPrice.value === 'number'
    ? fullPrice.value
    : parseFloat(String(fullPrice.value || '0'));
  const currency  = fullPrice.currency_value || 'BRL';

  // BRL amount — use producer net if available, else full price
  // producer_net_brl is a custom field sometimes added; fallback to raw amount
  const amountBrl: number = (purchase as any).producer_net_brl
    ?? (purchase as any).producer_net
    ?? (currency === 'BRL' ? amount : 0);

  /* ── UTM / Origin data ── */
  const origin = purchase.origin || {};
  const utmFields = parseHotmartOrigin(origin);

  /* ── Validate transaction ── */
  if (!transaction || transaction === 'undefined') {
    console.warn('[Hotmart Webhook] Transação sem ID, ignorando');
    return NextResponse.json({ success: true, ignored: 'no_transaction' });
  }

  /* ── Build and store sale record ── */
  const sale: WebhookSale = {
    transaction,
    event,
    productName,
    productId,
    buyerEmail,
    buyerName,
    amount,
    amountBrl,
    currency,
    approvedDateMs: typeof approvedDateMs === 'number' ? approvedDateMs : Date.parse(approvedDateMs),
    orderDate,
    ...utmFields,
  };

  storeWebhookSale(sale);

  // Invalidate sales cache so the dashboard refreshes
  invalidateSalesCache();

  console.log(
    `[Hotmart Webhook] Armazenado: ${transaction} | ${productName} | R$${amountBrl.toFixed(2)}` +
    ` | src="${utmFields.src}" sck="${utmFields.sck}" xcod="${utmFields.xcod}"` +
    ` | campaign="${utmFields.utmCampaign}" medium="${utmFields.utmMedium}" content="${utmFields.utmContent}"`,
  );

  return NextResponse.json({
    success: true,
    transaction,
    event,
    utmCampaign: utmFields.utmCampaign,
    utmMedium:   utmFields.utmMedium,
    utmContent:  utmFields.utmContent,
  });
}

/**
 * GET — Debug endpoint: list all stored webhook sales.
 * Only available in development or when ?key=HOTMART_HOTTOK is provided.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  const hottok = process.env.HOTMART_HOTTOK;

  if (hottok && key !== hottok) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { getWebhookSales } = await import('@/app/lib/webhookStore');
  const sales = getWebhookSales();
  return NextResponse.json({ count: sales.length, sales });
}
