import { NextResponse } from 'next/server';
import { storeWebhookSale, calcAttributionStatus, type WebhookSale } from '@/app/lib/webhookStore';

export const runtime  = 'nodejs';
export const dynamic  = 'force-dynamic';

/**
 * POST /api/hotmart/import-utm
 *
 * Imports UTM-attributed sales from Hotmart's export (manual backfill).
 *
 * Hotmart Dashboard → Relatórios → Origem de vendas → UTM → Exportar relatório
 * Export as JSON array:
 * [
 *   {
 *     "transaction": "HP123456",
 *     "utm_campaign": "perpetuo_vendas_neuronews",
 *     "utm_medium":   "frio_01_cargos",
 *     "utm_content":  "ad11_img_neuro",
 *     "utm_source":   "facebook",
 *     "utm_term":     "120218782748900123",
 *     "amount":       997,
 *     "currency":     "BRL",
 *     "product":      "NeuroNews",
 *     "approved_date":"2026-03-15T10:00:00.000Z"
 *   }
 * ]
 *
 * Requires: ?key=<HOTMART_HOTTOK>
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const key    = searchParams.get('key');
  const hottok = process.env.HOTMART_HOTTOK || '';

  if (!hottok || key !== hottok) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  let body: any[] = [];
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Body deve ser um array' }, { status: 400 });
  }

  const imported: string[] = [];
  const skipped:  string[] = [];
  const errors:   string[] = [];

  for (const row of body) {
    try {
      const txId = (row.transaction || row.tx || row.id || '').toString().trim();
      if (!txId) { errors.push('Row sem transaction ID'); continue; }

      const utm_source   = (row.utm_source   || row.source   || '').toString().trim() || null;
      const utm_campaign = (row.utm_campaign || row.campaign || '').toString().trim() || null;
      const utm_medium   = (row.utm_medium   || row.medium   || '').toString().trim() || null;
      const utm_content  = (row.utm_content  || row.content  || '').toString().trim() || null;
      const utm_term     = (row.utm_term     || row.term     || '').toString().trim() || null;

      if (!utm_campaign && !utm_medium && !utm_source) {
        skipped.push(`${txId}: sem UTMs`);
        continue;
      }

      const attribution_status = calcAttributionStatus(
        utm_source, utm_campaign, utm_medium, utm_content, utm_term,
      );

      const approvedDateMs = row.approved_date
        ? new Date(row.approved_date).getTime()
        : Date.now();

      const amount   = parseFloat(row.amount   || row.value  || '0') || 0;
      const currency = (row.currency || 'BRL').toString().toUpperCase();

      const sale: WebhookSale = {
        sale_id:      txId,
        event:        'PURCHASE_APPROVED',
        receivedAt:   Date.now(),
        source:       'report',  // Explicitly marked as manual import
        product_id:   row.product_id || 0,
        product_name: (row.product || row.product_name || '').toString(),
        buyer_email:  (row.email   || row.buyer_email  || '').toString(),
        buyer_name:   (row.buyer   || row.buyer_name   || '').toString(),
        amount,
        amountBrl:    currency === 'BRL' ? amount : 0,
        currency,
        approvedDateMs,
        orderDate:    new Date(approvedDateMs).toISOString(),
        raw_src:      utm_campaign || '',
        raw_sck:      utm_medium   || '',
        raw_xcod:     utm_content  || '',
        utm_source,
        utm_campaign,
        utm_medium,
        utm_content,
        utm_term,
        attribution_status,
        origem:               utm_source,
        campanha:             utm_campaign,
        conjunto_de_anuncios: utm_medium,
        anuncio:              utm_content,
        raw_payload:  { imported: true, original: row },
      };

      await storeWebhookSale(sale);
      imported.push(txId);
    } catch (e: any) {
      errors.push(`Row error: ${e.message}`);
    }
  }

  return NextResponse.json({
    success: true,
    imported: imported.length,
    skipped:  skipped.length,
    errors:   errors.length,
    imported_ids: imported,
    skipped_detail: skipped,
    error_detail:   errors,
    hint: 'Acesse /trafego/vendas-por-origem para ver as vendas importadas na tabela.',
  });
}

/**
 * GET /api/hotmart/import-utm
 * Shows import instructions.
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/hotmart/import-utm',
    method: 'POST',
    description: 'Importa vendas UTM históricas do relatório Hotmart para o dashboard.',
    authentication: 'Query param ?key=<HOTMART_HOTTOK>',
    body_format: [
      {
        transaction:    'HP123456',
        utm_campaign:   'nome_da_campanha_meta',
        utm_medium:     'nome_do_conjunto_meta',
        utm_content:    'nome_do_anuncio_meta',
        utm_source:     'facebook',
        utm_term:       '120218782748900123',
        amount:         997,
        currency:       'BRL',
        product:        'NeuroNews',
        approved_date:  '2026-03-15T10:00:00.000Z',
      },
    ],
    steps: [
      '1. No Hotmart: Relatórios → Origem de vendas → Aba UTM → Exportar relatório',
      '2. Converta o CSV para o formato JSON acima (1 objeto por venda)',
      '3. POST para este endpoint com o array no body',
    ],
  });
}
