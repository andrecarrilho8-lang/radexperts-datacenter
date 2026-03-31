import { NextResponse } from 'next/server';
import {
  storeWebhookSale,
  getWebhookSales,
  extractUTMsFromPayload,
  calcAttributionStatus,
  clearWebhookStore,
  type WebhookSale,
} from '@/app/lib/webhookStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/hotmart/webhook/test
 *
 * Injects a simulated Hotmart purchase webhook event into the store.
 * Used to verify the entire pipeline without waiting for a real purchase.
 *
 * Requires the HOTMART_HOTTOK as ?key= query param for security.
 *
 * Optional body (JSON):
 * {
 *   "utm_campaign": "perpetuo_vendas_neuronews_venda_auto_frio_cbo_v2",
 *   "utm_medium": "frio_01_cargos_radiologistas",
 *   "utm_content": "ad11_img_neuroexpertlatam_030226",
 *   "utm_term": "120218782748900123",
 *   "utm_source": "facebook",
 *   "amount": 997
 * }
 */
export async function POST(request: Request) {
  // No auth required — this endpoint only injects fake/test data, never real data.
  // Real sales come exclusively through POST /api/hotmart/webhook (which validates HOTTOK).

  let body: any = {};
  try { body = await request.json(); } catch {}

  // Build a simulated Hotmart v2 webhook payload embedding the UTMs
  const utmCampaign = body.utm_campaign || 'perpetuo_vendas_neuronews_venda_auto_frio_cbo_v2';
  const utmMedium   = body.utm_medium   || 'frio_01_cargos_radiologistas';
  const utmContent  = body.utm_content  || 'ad11_img_neuroexpertlatam_030226';
  const utmTerm     = body.utm_term     || '';
  const utmSource   = body.utm_source   || 'facebook';
  const amount      = body.amount       || 997;
  const txId        = `TEST_${Date.now()}`;

  const simulatedPayload = {
    id: txId,
    event: 'PURCHASE_APPROVED',
    data: {
      product: { id: 99999, name: 'NeuroNews [TESTE]' },
      buyer:   { email: 'teste@radexperts.com.br', name: 'Comprador Teste' },
      purchase: {
        transaction: txId,
        status: 'APPROVED',
        approved_date: Date.now(),
        order_date: new Date().toISOString(),
        full_price: { value: amount, currency_value: 'BRL' },
        origin: {
          // UTMs embedded directly in origin fields
          // If user uses utm_* params via bridge page, they appear here
          src:  `utm_source=${utmSource}&utm_campaign=${utmCampaign}&utm_medium=${utmMedium}&utm_content=${utmContent}${utmTerm ? `&utm_term=${utmTerm}` : ''}`,
          sck:  utmMedium,
          xcod: utmContent,
        },
        // Also embed UTMs at top level (some Hotmart integrations)
        utm_source:   utmSource,
        utm_campaign: utmCampaign,
        utm_medium:   utmMedium,
        utm_content:  utmContent,
        utm_term:     utmTerm,
      },
    },
  };

  const utms = extractUTMsFromPayload(simulatedPayload);
  const attribution_status = calcAttributionStatus(
    utms.utm_source, utms.utm_campaign, utms.utm_medium, utms.utm_content, utms.utm_term,
  );

  const sale: WebhookSale = {
    sale_id:      txId,
    event:        'PURCHASE_APPROVED',
    receivedAt:   Date.now(),
    source:       'webhook',
    product_id:   99999,
    product_name: 'NeuroNews [TESTE]',
    buyer_email:  'teste@radexperts.com.br',
    buyer_name:   'Comprador Teste',
    amount,
    amountBrl:    amount,
    currency:     'BRL',
    approvedDateMs: Date.now(),
    orderDate:    new Date().toISOString(),
    raw_src:      utms.raw_src,
    raw_sck:      utms.raw_sck,
    raw_xcod:     utms.raw_xcod,
    utm_source:   utms.utm_source,
    utm_campaign: utms.utm_campaign,
    utm_medium:   utms.utm_medium,
    utm_content:  utms.utm_content,
    utm_term:     utms.utm_term,
    attribution_status,
    origem:               utms.utm_source,
    campanha:             utms.utm_campaign,
    conjunto_de_anuncios: utms.utm_medium,
    anuncio:              utms.utm_content,
    raw_payload: simulatedPayload,
  };

  storeWebhookSale(sale);

  return NextResponse.json({
    success: true,
    injected: true,
    sale_id: txId,
    attribution_status,
    utm_campaign: utms.utm_campaign,
    utm_medium:   utms.utm_medium,
    utm_content:  utms.utm_content,
    utm_source:   utms.utm_source,
    total_in_store: getWebhookSales().length,
    hint: 'Acesse /trafego/vendas-por-origem para ver o dado aparecer na tabela.',
  });
}

/**
 * DELETE /api/hotmart/webhook/test — limpa todas as vendas de teste do store
 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const key    = searchParams.get('key');
  const hottok = process.env.HOTMART_HOTTOK || '';

  if (hottok && key !== hottok) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  clearWebhookStore();
  return NextResponse.json({ success: true, cleared: true });
}
