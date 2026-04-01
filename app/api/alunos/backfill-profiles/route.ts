import { NextResponse } from 'next/server';
import { getDb, ensureWebhookSchema } from '@/app/lib/db';
import { getHotmartToken } from '@/app/lib/hotmartApi';
import https from 'https';

export const dynamic  = 'force-dynamic';
export const runtime  = 'nodejs';
export const maxDuration = 300; // Vercel Pro: 5 min timeout

// ── Hotmart API helper ────────────────────────────────────────────────────────
const HOTMART_API_HOST = 'developers.hotmart.com';

function htGet(path: string, token: string): Promise<any> {
  return new Promise((resolve) => {
    const req = https.request(
      { hostname: HOTMART_API_HOST, path, method: 'GET',
        headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        let data = '';
        res.on('data', (c: any) => { data += c; });
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
      }
    );
    req.on('error', () => resolve(null));
    req.end();
  });
}

// ── Fetch all sales in date range with chunking ───────────────────────────────
async function fetchAllSales(token: string, startMs: number, endMs: number): Promise<any[]> {
  const CHUNK       = 60 * 24 * 60 * 60 * 1000; // 60-day chunks
  const CONCURRENCY = 6;
  const chunks: { start: number; end: number }[] = [];
  let cur = startMs;
  while (cur < endMs) {
    chunks.push({ start: cur, end: Math.min(cur + CHUNK, endMs) });
    cur += CHUNK + 1;
  }

  const all: any[] = [];
  const seenTx = new Set<string>();

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (chunk) => {
      const items: any[] = [];
      let pageToken = '';
      for (let p = 0; p < 10; p++) {
        const path = `/payments/api/v1/sales/history?start_date=${chunk.start}&end_date=${chunk.end}&max_results=500${pageToken ? `&page_token=${pageToken}` : ''}`;
        const data = await htGet(path, token);
        if (!data?.items?.length) break;
        items.push(...data.items);
        pageToken = data.page_info?.next_page_token || '';
        if (!pageToken) break;
      }
      return items;
    }));
    for (const arr of results) {
      for (const s of arr) {
        const tx = s.purchase?.transaction;
        if (tx && !seenTx.has(tx)) { seenTx.add(tx); all.push(s); }
      }
    }
  }
  return all;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Default: backfill last 3 years
  const endMs   = Date.now();
  const startMs = new Date(searchParams.get('start') || '2023-01-01').getTime();

  const APPROVED = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

  try {
    // 1. Ensure tables
    await ensureWebhookSchema();
    const sql = getDb();

    // 2. Fetch all Hotmart sales
    console.log('[Backfill] Fetching Hotmart sales...');
    const token = await getHotmartToken();
    const sales = await fetchAllSales(token, startMs, endMs);
    console.log(`[Backfill] Got ${sales.length} total sales`);

    // 3. Build buyer profile map — deduplicate by email, track first/last purchase
    type ProfileEntry = {
      email: string; name: string; phone: string; document: string; country: string;
      src: string; sck: string; utm_source: string; utm_medium: string;
      utm_campaign: string; utm_content: string; utm_term: string;
      first_src: string; first_sck: string;
      first_utm_source: string; first_utm_medium: string; first_utm_campaign: string;
      first_utm_content: string; first_utm_term: string;
      last_transaction: string; last_product: string;
      last_purchase_at: number; first_purchase_at: number; purchase_count: number;
    };

    const profileMap = new Map<string, ProfileEntry>();

    for (const s of sales) {
      const purchase = s.purchase || {};
      const buyer    = s.buyer    || {};
      const product  = s.product  || {};
      const tracking = purchase.tracking || {};

      const status = (purchase.status || '').toUpperCase();
      const email  = (buyer.email || '').toLowerCase().trim();
      if (!email) continue;
      // Process ALL statuses (not just APPROVED) so we always capture the phone
      // Even CANCELED purchases had the buyer fill in their phone at checkout

      const purchaseAt = Number(purchase.approved_date || purchase.order_date || 0);
      const src         = (tracking.source       || '').trim();
      const sck         = (tracking.source_sck   || '').trim();
      const utmSource   = (tracking.utm_source   || '').trim();
      const utmMedium   = (tracking.utm_medium   || '').trim();
      const utmCampaign = (tracking.utm_campaign || '').trim();
      const utmContent  = (tracking.utm_content  || '').trim();
      const utmTerm     = (tracking.utm_term     || '').trim();
      const phone       = (buyer.phone || buyer.checkout_phone || '').trim();
      const transaction = purchase.transaction || '';

      const existing = profileMap.get(email);
      if (!existing) {
        profileMap.set(email, {
          email,
          name:          buyer.name || '',
          phone,
          document:      buyer.document || buyer.cpf || '',
          country:       buyer.address?.country || '',
          src, sck, utm_source: utmSource, utm_medium: utmMedium,
          utm_campaign: utmCampaign, utm_content: utmContent, utm_term: utmTerm,
          first_src: src, first_sck: sck,
          first_utm_source: utmSource, first_utm_medium: utmMedium,
          first_utm_campaign: utmCampaign, first_utm_content: utmContent,
          first_utm_term: utmTerm,
          last_transaction: APPROVED.has(status) ? transaction : '',
          last_product:     APPROVED.has(status) ? (product.name || '') : '',
          last_purchase_at: purchaseAt,
          first_purchase_at: purchaseAt,
          purchase_count: APPROVED.has(status) ? 1 : 0,
        });
      } else {
        // Merge: keep best data
        if (!existing.phone && phone) existing.phone = phone;
        if (!existing.name && buyer.name) existing.name = buyer.name;
        if (!existing.document && (buyer.document || buyer.cpf)) existing.document = buyer.document || buyer.cpf || '';
        if (!existing.country && buyer.address?.country) existing.country = buyer.address.country;

        // First purchase (earliest)
        if (purchaseAt > 0 && (existing.first_purchase_at === 0 || purchaseAt < existing.first_purchase_at)) {
          existing.first_purchase_at = purchaseAt;
          existing.first_src = src || existing.first_src;
          existing.first_sck = sck || existing.first_sck;
          existing.first_utm_source   = utmSource   || existing.first_utm_source;
          existing.first_utm_medium   = utmMedium   || existing.first_utm_medium;
          existing.first_utm_campaign = utmCampaign || existing.first_utm_campaign;
          existing.first_utm_content  = utmContent  || existing.first_utm_content;
          existing.first_utm_term     = utmTerm     || existing.first_utm_term;
        }

        // Last purchase (latest — only approved)
        if (APPROVED.has(status) && purchaseAt > existing.last_purchase_at) {
          existing.last_purchase_at = purchaseAt;
          existing.last_transaction = transaction;
          existing.last_product     = product.name || '';
          existing.src = src || existing.src;
          existing.sck = sck || existing.sck;
          existing.utm_source   = utmSource   || existing.utm_source;
          existing.utm_medium   = utmMedium   || existing.utm_medium;
          existing.utm_campaign = utmCampaign || existing.utm_campaign;
          existing.utm_content  = utmContent  || existing.utm_content;
          existing.utm_term     = utmTerm     || existing.utm_term;
          existing.purchase_count += 1;
        }
      }
    }

    const profiles = [...profileMap.values()];
    console.log(`[Backfill] ${profiles.length} unique buyers`);

    // 4. Upsert to Neon in batches of 20
    const now = Date.now();
    const BATCH = 20;
    let upserted = 0;
    let withPhone = 0;

    for (let i = 0; i < profiles.length; i += BATCH) {
      const batch = profiles.slice(i, i + BATCH);
      await Promise.all(batch.map(async (p) => {
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
              ${p.email},
              ${p.name || null}, ${p.phone || null},
              ${p.document || null}, ${p.country || null},
              ${p.src || null}, ${p.sck || null},
              ${p.utm_source || null}, ${p.utm_medium || null}, ${p.utm_campaign || null},
              ${p.utm_content || null}, ${p.utm_term || null},
              ${p.first_src || null}, ${p.first_sck || null},
              ${p.first_utm_source || null}, ${p.first_utm_medium || null},
              ${p.first_utm_campaign || null}, ${p.first_utm_content || null},
              ${p.first_utm_term || null},
              ${p.last_transaction || null}, ${p.last_product || null},
              ${p.last_purchase_at || null},
              ${p.first_purchase_at || null}, ${p.purchase_count},
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
              last_transaction   = COALESCE(NULLIF(EXCLUDED.last_transaction, ''), buyer_profiles.last_transaction),
              last_product       = COALESCE(NULLIF(EXCLUDED.last_product, ''),     buyer_profiles.last_product),
              last_purchase_at   = GREATEST(buyer_profiles.last_purchase_at, EXCLUDED.last_purchase_at),
              first_purchase_at  = LEAST(buyer_profiles.first_purchase_at, EXCLUDED.first_purchase_at),
              purchase_count     = GREATEST(buyer_profiles.purchase_count, EXCLUDED.purchase_count),
              updated_at         = ${now}
          `;
          upserted++;
          if (p.phone) withPhone++;
        } catch (e: any) {
          console.error('[Backfill] Upsert error for', p.email, e.message);
        }
      }));
    }

    return NextResponse.json({
      ok: true,
      total_sales:    sales.length,
      unique_buyers:  profiles.length,
      upserted,
      with_phone:     withPhone,
      without_phone:  upserted - withPhone,
      coverage_pct:   upserted > 0 ? Math.round((withPhone / upserted) * 100) : 0,
      period_start:   new Date(startMs).toISOString(),
      period_end:     new Date(endMs).toISOString(),
    });
  } catch (e: any) {
    console.error('[Backfill] Error:', e.message);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
