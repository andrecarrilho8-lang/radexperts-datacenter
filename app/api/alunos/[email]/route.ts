import { NextResponse } from 'next/server';
import { getHotmartToken } from '@/app/lib/hotmartApi';

const HOTMART_API_HOST = 'developers.hotmart.com';
const AC_URL = process.env.ACTIVECAMPAIGN_URL;
const AC_KEY = process.env.ACTIVECAMPAIGN_KEY;

async function htGet(path: string, token: string): Promise<any> {
  const https = await import('https');
  return new Promise((resolve) => {
    const req = https.default.request(
      { hostname: HOTMART_API_HOST, path, method: 'GET', headers: { Authorization: `Bearer ${token}` } },
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

async function acGet(path: string): Promise<any> {
  if (!AC_URL || !AC_KEY) return null;
  try {
    const res = await fetch(`${AC_URL}/api/3${path}`, {
      headers: { 'Api-Token': AC_KEY, 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ email: string }> }
) {
  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail).toLowerCase().trim();

  try {
    const token = await getHotmartToken();

    // ── 1. Hotmart: all-time sales history by email ──────────────────────────
    // Search last 5 years in one call (max_results=500 per page)
    const nowMs   = Date.now();
    const fiveYrs = nowMs - 5 * 365 * 24 * 60 * 60 * 1000;
    const allSales: any[] = [];
    let pageToken = '';

    for (let i = 0; i < 30; i++) {
      let path = `/payments/api/v1/sales/history?buyer_email=${encodeURIComponent(email)}&start_date=${fiveYrs}&end_date=${nowMs}&max_results=500`;
      if (pageToken) path += `&page_token=${pageToken}`;
      const data = await htGet(path, token);
      if (!data?.items?.length) break;
      allSales.push(...data.items);
      pageToken = data.page_info?.next_page_token || '';
      if (!pageToken) break;
    }

    // ── 2. Hotmart: subscriptions ─────────────────────────────────────────────
    let subscriptions: any[] = [];
    try {
      const subPath = `/payments/api/v1/subscriptions?subscriber_email=${encodeURIComponent(email)}&max_results=50`;
      const subData = await htGet(subPath, token);
      subscriptions = subData?.items || [];
    } catch { /* non-critical */ }

    // Build buyer info from first sale
    const firstSale = allSales[0];
    const buyerInfo = firstSale ? {
      name:     firstSale.buyer?.name || '',
      email:    firstSale.buyer?.email || email,
      phone:    firstSale.buyer?.phone || '',
      document: firstSale.buyer?.document || '',
    } : { name: '', email, phone: '', document: '' };

    // Map purchases
    const purchases = allSales
      .filter((s: any) => {
        const status = (s.purchase?.status || '').toUpperCase();
        return ['APPROVED','COMPLETE','PRODUCER_CONFIRMED','CONFIRMED','CANCELED','REFUNDED','CHARGEBACK','EXPIRED','WAITING_PAYMENT'].includes(status);
      })
      .map((s: any) => {
        const p = s.purchase || {};
        const price = p.price || {};
        return {
          txId:           p.transaction,
          status:         p.status,
          date:           p.approved_date || p.order_date,
          product:        s.product?.name || '',
          productId:      s.product?.id,
          currency:       price.currency_code || 'BRL',
          grossValue:     price.value ?? 0,
          convertedBRL:   price.converted_value ?? null,
          netValue:       p.producer_net ?? null,
          netBRL:         p.producer_net_brl ?? null,
          hotmartFeePct:  p.hotmart_fee?.percentage ?? 0,
          hotmartFeeAmt:  p.hotmart_fee?.total ?? 0,
          paymentType:    p.payment?.type || p.payment_type || '',
          installments:   p.payment?.installments_number || 1,
          recurrencyNum:  p.recurrency_number || null,
          isSubscription: p.is_subscription === true,
          // UTMs / tracking
          offer:          p.offer?.code || '',
          src:            p.tracking?.source || p.src || '',
          sck:            p.tracking?.source_sck || p.sck || '',
          utmSource:      p.tracking?.utm_source || '',
          utmMedium:      p.tracking?.utm_medium || '',
          utmCampaign:    p.tracking?.utm_campaign || '',
          utmContent:     p.tracking?.utm_content || '',
          utmTerm:        p.tracking?.utm_term || '',
          country:        s.buyer?.address?.country || '',
        };
      })
      .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    // ── 3. ActiveCampaign: search by email ───────────────────────────────────
    const acSearch = await acGet(`/contacts?email=${encodeURIComponent(email)}&include=contactTags,contactLists,contactAutomations`);
    const acContact = acSearch?.contacts?.[0] || null;
    const acContactId = acContact?.id;

    let acTags: any[]        = [];
    let acLists: any[]       = [];
    let acAutomations: any[] = [];
    let acActivities: any[]  = [];
    let acFields: any[]      = [];
    let acScore: number | null = null;
    let acDealList: any[]    = [];

    if (acContactId) {
      // Tags with dates
      const tagsData = await acGet(`/contacts/${acContactId}/contactTags`);
      acTags = (tagsData?.contactTags || []).map((t: any) => ({
        tag:     t.tag,
        tagId:   t.tagid,
        created: t.cdate,
      }));

      // Resolve tag names
      if (acTags.length > 0) {
        const tagNames = await acGet(`/tags?limit=100`);
        const tagMap: Record<string, string> = {};
        (tagNames?.tags || []).forEach((t: any) => { tagMap[t.id] = t.tag; });
        acTags = acTags.map((t: any) => ({ ...t, tagName: tagMap[t.tagId] || `Tag #${t.tagId}` }));
      }

      // Lists
      const listsData = await acGet(`/contacts/${acContactId}/contactLists`);
      const listMeta  = await acGet(`/lists?limit=50`);
      const listMap: Record<string, string> = {};
      (listMeta?.lists || []).forEach((l: any) => { listMap[l.id] = l.name; });
      acLists = (listsData?.contactLists || []).map((l: any) => ({
        listId:    l.list,
        name:      listMap[l.list] || `Lista #${l.list}`,
        status:    l.status, // 1=subscribed, 2=unsubscribed
        created:   l.cdate,
        updated:   l.udate,
      }));

      // Automations
      const autoData = await acGet(`/contacts/${acContactId}/contactAutomations`);
      const autoMeta = await acGet(`/automations?limit=50`);
      const autoMap: Record<string, string> = {};
      (autoMeta?.automations || []).forEach((a: any) => { autoMap[a.id] = a.name; });
      acAutomations = (autoData?.contactAutomations || []).map((a: any) => ({
        automationId: a.automation,
        name:         autoMap[a.automation] || `Automação #${a.automation}`,
        status:       a.status,  // active/completed
        entered:      a.adddate,
        exited:       a.remdate || null,
        completed:    a.completed === '1',
      }));

      // Activity log
      const actData = await acGet(`/contacts/${acContactId}/activities?limit=20`);
      acActivities = actData?.activities || [];

      // Custom fields
      const fieldData = await acGet(`/contacts/${acContactId}/fieldValues`);
      acFields = (fieldData?.fieldValues || []).map((f: any) => ({
        field: f.field,
        value: f.value,
      }));

      // Score
      const scoreData = await acGet(`/contacts/${acContactId}/scoreValues`);
      const scores = scoreData?.scoreValues || [];
      if (scores.length > 0) acScore = Number(scores[0]?.score) || null;

      // Deals
      const dealData = await acGet(`/contacts/${acContactId}/deals`);
      acDealList = (dealData?.deals || []).map((d: any) => ({
        id:      d.id,
        title:   d.title,
        value:   d.value,
        status:  d.status,
        stage:   d.stage,
        created: d.cdate,
        updated: d.mdate,
      }));
    }

    return NextResponse.json({
      buyer: buyerInfo,
      purchases,
      subscriptions,
      ac: acContactId ? {
        id:          acContactId,
        firstName:   acContact.firstName,
        lastName:    acContact.lastName,
        email:       acContact.email,
        phone:       acContact.phone,
        city:        acContact.fieldValues ? null : acContact.orgname,
        created:     acContact.cdate,
        updated:     acContact.udate,
        score:       acScore,
        tags:        acTags,
        lists:       acLists,
        automations: acAutomations,
        activities:  acActivities,
        fields:      acFields,
        deals:       acDealList,
      } : null,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
