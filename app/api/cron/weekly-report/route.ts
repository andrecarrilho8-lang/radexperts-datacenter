import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getDb, ensureWebhookSchema } from '@/app/lib/db';
import { fetchHotmartSales } from '@/app/lib/hotmartApi';
import { initSDK, parseMetrics, mapObjective, INSIGHT_FIELDS } from '@/app/lib/metaApi';

export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';
export const maxDuration = 60;

const APPROVED = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}
function fmtDate(ts: number | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ── Per-campaign detailed insights ────────────────────────────────────────────
function campaignInsight(c: any): string {
  const parts: string[] = [];

  // Spend assessment
  if (c.spend > 2000)      parts.push(`Budget expressivo de ${fmtBRL(c.spend)} — monitore o retorno de perto.`);
  else if (c.spend < 200)  parts.push(`Investimento baixo (${fmtBRL(c.spend)}) — considere aumentar o budget para resultados mais representativos.`);

  // Leads / CPL
  if (c.leads > 0) {
    if (c.costPerLead <= 20)       parts.push(`CPL de ${fmtBRL(c.costPerLead)} — excelente, abaixo do benchmark de R$30.`);
    else if (c.costPerLead <= 40)  parts.push(`CPL de ${fmtBRL(c.costPerLead)} — dentro do aceitável.`);
    else                           parts.push(`CPL de ${fmtBRL(c.costPerLead)} — alto, revise copy e segmentação.`);
  } else if (c.objective === 'LEADS') {
    parts.push('Sem leads registrados. Verifique o pixel e a configuração do objetivo.');
  }

  // Purchases / CPA
  if (c.purchases > 0) {
    parts.push(`${c.purchases} venda${c.purchases>1?'s':''} com CPA de ${fmtBRL(c.cpa)}.`);
  }

  // CTR
  if (c.ctr > 0) {
    if (c.ctr >= 2)      parts.push(`CTR de ${c.ctr.toFixed(2)}% — anúncios com alto engajamento.`);
    else if (c.ctr < 0.8) parts.push(`CTR de ${c.ctr.toFixed(2)}% — criativo com baixo engajamento, teste novas imagens/copies.`);
  }

  // CPM
  if (c.cpm > 0) {
    if (c.cpm > 50) parts.push(`CPM de ${fmtBRL(c.cpm)} — audiência competitiva ou segmentação muito restrita.`);
  }

  // Connect rate
  if (c.connectRate < 50 && c.outboundClicks > 10) {
    parts.push(`Taxa de conexão de ${c.connectRate.toFixed(0)}% — muitos cliques não chegam à landing page, revise a velocidade da página.`);
  }

  if (parts.length === 0) parts.push('Dados insuficientes para análise aprofundada no período.');
  return parts.join(' ');
}

// ── General traffic summary insights ─────────────────────────────────────────
function summaryInsights(campaigns: any[], totalSpend: number, totalLeads: number, totalPurchases: number): string[] {
  const ins: string[] = [];
  if (!campaigns.length) return ['Nenhuma campanha com gasto no período.'];

  const leadCamps  = campaigns.filter(c => c.objective === 'LEADS');
  const salesCamps = campaigns.filter(c => c.objective === 'VENDAS');

  // Spend split
  const leadSpend  = leadCamps.reduce((s, c) => s + c.spend, 0);
  const salesSpend = salesCamps.reduce((s, c) => s + c.spend, 0);
  if (totalSpend > 0) {
    ins.push(`💰 Gasto total: ${fmtBRL(totalSpend)} — ${Math.round(leadSpend/totalSpend*100)}% em Leads, ${Math.round(salesSpend/totalSpend*100)}% em Vendas.`);
  }

  // CPL average for lead campaigns
  const cplCamps = leadCamps.filter(c => c.costPerLead > 0);
  const avgCpl   = cplCamps.length ? cplCamps.reduce((s, c) => s + c.costPerLead, 0) / cplCamps.length : 0;
  if (avgCpl > 0) {
    if (avgCpl <= 25)      ins.push(`🟢 CPL médio de ${fmtBRL(avgCpl)} nas campanhas de Leads — excelente eficiência de captação.`);
    else if (avgCpl <= 50)  ins.push(`🟡 CPL médio de ${fmtBRL(avgCpl)} nas campanhas de Leads — aceitável, mas há espaço para otimização.`);
    else                    ins.push(`🔴 CPL médio de ${fmtBRL(avgCpl)} nas campanhas de Leads — revise segmentação e criativos urgentemente.`);
  }

  // Best by leads
  const bestLeads = [...leadCamps].sort((a, b) => b.leads - a.leads)[0];
  if (bestLeads?.leads > 0) ins.push(`🏆 Melhor captação: "${bestLeads.name}" com ${bestLeads.leads} leads a ${fmtBRL(bestLeads.costPerLead)} cada.`);

  // Best by purchases
  const bestSales = [...salesCamps].sort((a, b) => b.purchases - a.purchases)[0];
  if (bestSales?.purchases > 0) ins.push(`🛒 Melhor venda: "${bestSales.name}" com ${bestSales.purchases} compra${bestSales.purchases>1?'s':''} e CPA de ${fmtBRL(bestSales.cpa)}.`);

  // No results warning
  if (totalLeads === 0 && totalPurchases === 0) ins.push('⚠️ Nenhum resultado (lead ou venda) registrado na semana. Verifique pixels e configurações de conversão.');

  return ins.slice(0, 5);
}

// ── Colors ────────────────────────────────────────────────────────────────────
const ROW_BG = '#0d1526';
const BORDER = '#1a2540';
const SILVER = '#a8b2c0';
const GOLD   = '#e8b14f';
const GREEN  = '#4ade80';
const BLUE   = '#38bdf8';
const RED    = '#f87171';
const ORANGE = '#f97316';
const PURPLE = '#a78bfa';

// ── Email shell ───────────────────────────────────────────────────────────────
function shell(title: string, accentColor: string, icon: string, period: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#060c1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#060c1a">
<tr><td align="center" style="padding:32px 16px 48px">
<table width="640" cellpadding="0" cellspacing="0">

  <!-- HEADER -->
  <tr><td style="background:linear-gradient(135deg,#090f20 0%,#0c1830 100%);border:1px solid ${accentColor}40;border-radius:20px;padding:28px 32px;text-align:center">
    <p style="font-size:9px;font-weight:700;letter-spacing:0.35em;text-transform:uppercase;color:${accentColor};margin:0 0 8px">RadExperts · Data Center</p>
    <h1 style="font-size:26px;font-weight:900;color:#fff;margin:0 0 4px;letter-spacing:-0.02em">${icon} ${title}</h1>
    <p style="font-size:12px;color:${SILVER};margin:0">${period}</p>
  </td></tr>
  <tr><td height="20"></td></tr>

  ${content}

  <!-- FOOTER -->
  <tr><td style="padding:24px;text-align:center">
    <p style="font-size:9px;color:#3a4560;text-transform:uppercase;letter-spacing:0.1em;margin:0">RadExperts Data Center · Relatório automático toda segunda-feira</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

function kpiRow(items: {label:string;val:string;color:string}[]): string {
  const cells = items.map(k =>
    `<td align="center" style="padding:16px 8px;background:${ROW_BG};border-right:1px solid ${BORDER}">
      <p style="font-size:19px;font-weight:900;color:${k.color};margin:0;line-height:1">${k.val}</p>
      <p style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:${SILVER};margin:5px 0 0">${k.label}</p>
    </td>`
  ).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`;
}

function sectionBox(dotColor: string, heading: string, badge: string, body: string): string {
  return `<tr><td style="background:${ROW_BG};border:1px solid ${BORDER};border-radius:14px;overflow:hidden">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr style="background:#0a1220"><td style="padding:13px 18px">
        <table cellpadding="0" cellspacing="0"><tr>
          <td><span style="width:6px;height:6px;border-radius:50%;background:${dotColor};display:inline-block;margin-right:8px;vertical-align:middle"></span></td>
          <td style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:${dotColor};vertical-align:middle">${heading}</td>
          ${badge ? `<td style="padding-left:12px"><span style="font-size:7px;font-weight:700;text-transform:uppercase;color:${dotColor}80;background:${dotColor}10;padding:2px 7px;border-radius:4px;border:1px solid ${dotColor}25">${badge}</span></td>` : '<td></td>'}
        </tr></table>
      </td></tr>
      <tr><td>${body}</td></tr>
    </table>
  </td></tr><tr><td height="14"></td></tr>`;
}

function thRow(cols: {label:string;align?:string}[]): string {
  return `<tr style="background:#080f1e">${cols.map(c =>
    `<th style="padding:7px 12px;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:${SILVER};text-align:${c.align||'left'};border-bottom:1px solid ${BORDER}">${c.label}</th>`
  ).join('')}</tr>`;
}

// ── Campaign group table ──────────────────────────────────────────────────────
function campTable(camps: any[], cols: string[]): string {
  if (camps.length === 0)
    return `<tr><td style="padding:16px;text-align:center;color:${SILVER};font-size:11px">Nenhuma campanha nesta categoria no período</td></tr>`;

  const headers = [
    {label:'Campanha'}, {label:'Gasto',align:'right'}, {label:'Leads',align:'right'},
    {label:'CPL',align:'right'}, {label:'Compras',align:'right'}, {label:'CTR',align:'right'},
  ].filter((_,i) => cols.includes(['name','spend','leads','cpl','purchases','ctr'][i]));

  const rows = camps.map((c, i) => {
    const tds = [];
    if (cols.includes('name'))      tds.push(`<td style="padding:9px 12px;font-size:11px;color:#e2e8f0;border-bottom:1px solid ${BORDER};max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.name}</td>`);
    if (cols.includes('spend'))     tds.push(`<td style="padding:9px 12px;font-size:11px;color:${ORANGE};font-weight:700;text-align:right;border-bottom:1px solid ${BORDER};white-space:nowrap">${fmtBRL(c.spend)}</td>`);
    if (cols.includes('leads'))     tds.push(`<td style="padding:9px 12px;font-size:11px;color:${BLUE};text-align:right;border-bottom:1px solid ${BORDER}">${c.leads||0}</td>`);
    if (cols.includes('cpl'))       tds.push(`<td style="padding:9px 12px;font-size:11px;color:${c.costPerLead>0?(c.costPerLead<=30?GREEN:c.costPerLead<=60?GOLD:RED):SILVER};text-align:right;border-bottom:1px solid ${BORDER}">${c.costPerLead>0?fmtBRL(c.costPerLead):'—'}</td>`);
    if (cols.includes('purchases')) tds.push(`<td style="padding:9px 12px;font-size:11px;color:${GREEN};text-align:right;border-bottom:1px solid ${BORDER}">${c.purchases||0}</td>`);
    if (cols.includes('ctr'))       tds.push(`<td style="padding:9px 12px;font-size:11px;color:${SILVER};text-align:right;border-bottom:1px solid ${BORDER}">${(c.ctr||0).toFixed(2)}%</td>`);
    return `<tr style="background:${i%2===0?ROW_BG:'#0a1220'}">${tds.join('')}</tr>`;
  }).join('');

  return `<table width="100%" cellpadding="0" cellspacing="0">
    ${thRow(headers)}
    <tbody>${rows}</tbody>
  </table>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// EMAIL 1: TRÁFEGO
// ──────────────────────────────────────────────────────────────────────────────
function buildTrafficEmail(data: {
  period: string;
  campaigns: any[];
  totalSpend: number;
  totalLeads: number;
  totalPurchases: number;
}): string {
  const { period, campaigns, totalSpend, totalLeads, totalPurchases } = data;

  const leadCamps  = campaigns.filter(c => c.objective === 'LEADS');
  const salesCamps = campaigns.filter(c => c.objective === 'VENDAS');
  const outroCamps = campaigns.filter(c => c.objective === 'OUTROS');

  const summary = summaryInsights(campaigns, totalSpend, totalLeads, totalPurchases);
  const summaryRows = summary.map(s =>
    `<tr><td style="padding:11px 18px;font-size:12px;color:#d8e0ec;line-height:1.6;border-bottom:1px solid #141f35">${s}</td></tr>`
  ).join('');

  // Per-campaign insights block
  const campInsightRows = campaigns.map(c =>
    `<tr style="border-bottom:1px solid ${BORDER}">
      <td style="padding:12px 18px">
        <p style="font-size:11px;font-weight:900;color:${c.objective==='LEADS'?BLUE:c.objective==='VENDAS'?GREEN:SILVER};margin:0 0 4px;text-transform:uppercase;letter-spacing:0.05em">${c.name}</p>
        <p style="font-size:11px;color:#c0cce0;margin:0;line-height:1.5">${campaignInsight(c)}</p>
      </td>
    </tr>`
  ).join('');

  const leadCols   = ['name','spend','leads','cpl','ctr'];
  const salesCols  = ['name','spend','purchases','ctr'];
  const outroCols  = ['name','spend','ctr'];

  const content = `
    <!-- KPIs -->
    <tr><td style="background:#090f1f;border:1px solid ${BORDER};border-radius:14px;overflow:hidden">
      ${kpiRow([
        { label:'Gasto Total Meta', val: fmtBRL(totalSpend), color: ORANGE },
        { label:'Leads', val: String(totalLeads), color: BLUE },
        { label:'Compras', val: String(totalPurchases), color: GREEN },
        { label:'Campanhas', val: String(campaigns.length), color: PURPLE },
      ])}
    </td></tr>
    <tr><td height="14"></td></tr>

    ${sectionBox(GOLD, 'Resumo & Análise Geral', 'IA',
      `<table width="100%" cellpadding="0" cellspacing="0"><tbody>${summaryRows}</tbody></table>`
    )}

    ${leadCamps.length > 0 ? sectionBox(BLUE, `Campanhas de Leads (${leadCamps.length})`, '',
      campTable(leadCamps, leadCols)
    ) : ''}

    ${salesCamps.length > 0 ? sectionBox(GREEN, `Campanhas de Vendas (${salesCamps.length})`, '',
      campTable(salesCamps, salesCols)
    ) : ''}

    ${outroCamps.length > 0 ? sectionBox(SILVER, `Outros (${outroCamps.length})`, '',
      campTable(outroCamps, outroCols)
    ) : ''}

    ${campaigns.length > 0 ? sectionBox(GOLD, 'Análise Detalhada por Campanha', 'IA',
      `<table width="100%" cellpadding="0" cellspacing="0"><tbody>${campInsightRows}</tbody></table>`
    ) : ''}
  `;

  return shell('Relatório de Tráfego', ORANGE, '📊', period, content);
}

// ──────────────────────────────────────────────────────────────────────────────
// EMAIL 2: FINANCEIRO
// ──────────────────────────────────────────────────────────────────────────────
function buildFinanceiroEmail(data: {
  period: string;
  hotmartWeek: number;
  hotmartRevenue: number;
  proximos: any[];
  inadimplentes: any[];
  totalProximos: number;
  totalInadimplentes: number;
}): string {
  const { period, hotmartWeek, hotmartRevenue, proximos, inadimplentes, totalProximos, totalInadimplentes } = data;

  const proximosRows = proximos.length === 0
    ? `<tr><td colspan="3" style="padding:20px;text-align:center;color:${SILVER};font-size:12px">Nenhum pagamento previsto para os próximos 7 dias</td></tr>`
    : proximos.slice(0, 20).map((p, i) =>
      `<tr style="background:${i%2===0?ROW_BG:'#0a1220'}">
        <td style="padding:9px 12px;font-size:11px;color:#e2e8f0;border-bottom:1px solid ${BORDER}">${p.name || p.email}</td>
        <td style="padding:9px 12px;font-size:11px;color:${BLUE};text-align:right;font-weight:700;border-bottom:1px solid ${BORDER}">${fmtBRL(p.valor||0)}</td>
        <td style="padding:9px 12px;font-size:11px;color:${GOLD};text-align:right;border-bottom:1px solid ${BORDER}">${fmtDate(p.nextMs)}</td>
      </tr>`).join('');

  const inadimRows = inadimplentes.length === 0
    ? `<tr><td colspan="3" style="padding:20px;text-align:center;color:${GREEN};font-size:12px">✅ Nenhum aluno inadimplente!</td></tr>`
    : inadimplentes.slice(0, 20).map((p, i) =>
      `<tr style="background:${i%2===0?ROW_BG:'#0a1220'}">
        <td style="padding:9px 12px;font-size:11px;color:#e2e8f0;border-bottom:1px solid ${BORDER}">${p.name || p.email}</td>
        <td style="padding:9px 12px;font-size:11px;color:${RED};text-align:right;font-weight:700;border-bottom:1px solid ${BORDER};white-space:nowrap">${fmtBRL(p.valor||0)}</td>
        <td style="padding:9px 12px;font-size:11px;color:${SILVER};text-align:right;border-bottom:1px solid ${BORDER}">${p.daysSince > 0 ? p.daysSince + 'd em atraso' : 'Inadimplente'}</td>
      </tr>`).join('');

  const content = `
    <tr><td style="background:#090f1f;border:1px solid ${BORDER};border-radius:14px;overflow:hidden">
      ${kpiRow([
        { label:'Receita Hotmart (liq.)', val: fmtBRL(hotmartRevenue), color: BLUE },
        { label:'Vendas na Semana', val: String(hotmartWeek), color: PURPLE },
        { label:'A Receber (7 dias)', val: fmtBRL(totalProximos), color: GREEN },
        { label:'Em Atraso', val: fmtBRL(totalInadimplentes), color: inadimplentes.length > 0 ? RED : GREEN },
      ])}
    </td></tr>
    <tr><td height="14"></td></tr>

    ${sectionBox(BLUE, `Próximos Pagamentos · ${proximos.length} alunos · ${fmtBRL(totalProximos)}`, '',
      `<table width="100%" cellpadding="0" cellspacing="0">
        ${thRow([{label:'Aluno'},{label:'Valor',align:'right'},{label:'Vencimento',align:'right'}])}
        <tbody>${proximosRows}${proximos.length>20?`<tr><td colspan="3" style="padding:8px 12px;text-align:center;font-size:10px;color:${SILVER}">+ ${proximos.length-20} pagamentos</td></tr>`:''}</tbody>
      </table>`
    )}

    ${sectionBox(RED, `Inadimplentes · ${inadimplentes.length} aluno${inadimplentes.length!==1?'s':''} · ${fmtBRL(totalInadimplentes)}`, '',
      `<table width="100%" cellpadding="0" cellspacing="0">
        ${thRow([{label:'Aluno'},{label:'Valor em Atraso',align:'right'},{label:'Status',align:'right'}])}
        <tbody>${inadimRows}${inadimplentes.length>20?`<tr><td colspan="3" style="padding:8px 12px;text-align:center;font-size:10px;color:${SILVER}">+ ${inadimplentes.length-20} alunos</td></tr>`:''}</tbody>
      </table>`
    )}
  `;

  return shell('Relatório Financeiro', GREEN, '💰', period, content);
}

// ── Main handler ───────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const authHeader   = request.headers.get('authorization');
  const cronSecret   = process.env.CRON_SECRET || '';
  const { searchParams } = new URL(request.url);
  const manualSecret = searchParams.get('secret') || '';

  if (authHeader !== `Bearer ${cronSecret}` && (!cronSecret || manualSecret !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // ── Dates ──────────────────────────────────────────────────────────────
    const now    = new Date();
    const today  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const toMs   = today.getTime() - 1;
    const fromMs = toMs - 6 * 24 * 60 * 60 * 1000;
    const dateFrom = new Date(fromMs).toISOString().slice(0, 10);
    const dateTo   = new Date(toMs  ).toISOString().slice(0, 10);
    const period   = `${new Date(fromMs).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} – ${new Date(toMs).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}`;

    // ── META ADS ──────────────────────────────────────────────────────────
    let campaigns: any[] = [];
    let totalSpend = 0, totalLeads = 0, totalPurchases = 0;
    try {
      const { AdAccount } = initSDK(process.env.META_ACCESS_TOKEN!);
      const account = new AdAccount(process.env.META_AD_ACCOUNT_ID!);

      const insights = await account.getInsights(
        [...INSIGHT_FIELDS, 'cpm'],
        { time_range: { since: dateFrom, until: dateTo }, level: 'campaign', limit: 100 }
      );

      const seen = new Set<string>();
      for (const row of insights) {
        const r    = row as any;
        const id   = r.campaign_id;
        const name = r.campaign_name || `Campanha ${id}`;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const m   = parseMetrics(r);
        const obj = mapObjective(r.objective || name);
        if (m.spend > 0) campaigns.push({ id, name, objective: obj, ...m });
      }
      campaigns.sort((a, b) => b.spend - a.spend);
      totalSpend     = campaigns.reduce((s, c) => s + c.spend,    0);
      totalLeads     = campaigns.reduce((s, c) => s + c.leads,    0);
      totalPurchases = campaigns.reduce((s, c) => s + c.purchases,0);
    } catch (e: any) { console.error('[weekly] Meta Ads:', e?.message || e); }

    // ── HOTMART ───────────────────────────────────────────────────────────
    let hotmartWeek = 0, hotmartRevenue = 0;
    try {
      const sales    = await fetchHotmartSales(`${dateFrom}T00:00:00`, `${dateTo}T23:59:59`);
      const approved = sales.filter((s: any) => APPROVED.has(s.purchase?.status));
      const seenTx   = new Set<string>();
      approved.forEach((s: any) => {
        const tx = s.purchase?.transaction;
        if (!tx || seenTx.has(tx)) return;
        seenTx.add(tx); hotmartWeek++;
        const isBrl = (s.purchase?.price?.currency_code || 'BRL').toUpperCase() === 'BRL';
        if (isBrl) {
          const pn = s.purchase?.producer_net;
          hotmartRevenue += pn != null ? pn : Math.max(0, (s.purchase?.price?.value??0)-(s.purchase?.hotmart_fee?.total??0));
        } else {
          const pnBrl = s.purchase?.producer_net_brl;
          if (pnBrl != null) hotmartRevenue += pnBrl;
          else hotmartRevenue += (s.purchase?.price?.converted_value||0) * (1-(s.purchase?.hotmart_fee?.percentage??0)/100);
        }
      });
    } catch (e: any) { console.error('[weekly] Hotmart:', e?.message || e); }

    // ── FINANCEIRO ────────────────────────────────────────────────────────
    let proximos: any[] = [], inadimplentes: any[] = [];
    let totalProximos = 0, totalInadimplentes = 0;
    try {
      await ensureWebhookSchema();
      const sql         = getDb();
      const nowMs       = Date.now();
      const weekAheadMs = nowMs + 7 * 24 * 60 * 60 * 1000;

      function toEpoch(v: any): number | null {
        if (!v) return null;
        const n = Number(v);
        if (!isNaN(n) && n > 1e12) return n;
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d.getTime();
      }

      // Use ILIKE for case-insensitive match; cast valor safely with NULLIF
      const rows = await sql`
        SELECT DISTINCT ON (bp.email)
          COALESCE(bp.name, bp.email)                      AS name,
          bp.email,
          NULLIF(bp.bp_valor, '')::numeric                 AS valor,
          TRIM(bp.bp_em_dia)                               AS bp_em_dia,
          bp.bp_proximo_pagamento,
          bp.bp_ultimo_pagamento
        FROM buyer_profiles bp
        WHERE NULLIF(bp.bp_valor, '')::numeric > 0
        ORDER BY bp.email, bp.updated_at DESC NULLS LAST
      ` as any[];

      rows.forEach((row: any) => {
        const valor    = Number(row.valor) || 0;
        if (!valor) return;
        const emDia    = (row.bp_em_dia || '').toLowerCase().trim();
        const nextMs   = toEpoch(row.bp_proximo_pagamento);
        const lastMs   = toEpoch(row.bp_ultimo_pagamento);
        const daysSince = lastMs ? Math.floor((nowMs - lastMs) / 86_400_000) : 0;

        if (emDia === 'inadimplente') {
          inadimplentes.push({ name: row.name, email: row.email, valor, daysSince });
          totalInadimplentes += valor;
        } else if (nextMs && nextMs >= nowMs && nextMs <= weekAheadMs) {
          proximos.push({ name: row.name, email: row.email, valor, nextMs });
          totalProximos += valor;
        }
      });

      proximos.sort((a, b) => a.nextMs - b.nextMs);
      inadimplentes.sort((a, b) => b.valor - a.valor);
    } catch (e: any) { console.error('[weekly] DB:', e?.message || e); }

    // ── Send 2 emails ──────────────────────────────────────────────────────
    const resend = new Resend(process.env.RESEND_API_KEY);
    const to     = process.env.REPORT_EMAIL || 'andrecarrilho8@gmail.com';

    const [r1, r2] = await Promise.all([
      resend.emails.send({
        from:    'RadExperts <onboarding@resend.dev>',
        to,
        subject: `📊 Tráfego · ${period}`,
        html:    buildTrafficEmail({ period, campaigns, totalSpend, totalLeads, totalPurchases }),
      }),
      resend.emails.send({
        from:    'RadExperts <onboarding@resend.dev>',
        to,
        subject: `💰 Financeiro · ${period}`,
        html:    buildFinanceiroEmail({ period, hotmartWeek, hotmartRevenue, proximos, inadimplentes, totalProximos, totalInadimplentes }),
      }),
    ]);

    return NextResponse.json({
      ok:             !r1.error && !r2.error,
      trafficEmailId: r1.data?.id,
      financeEmailId: r2.data?.id,
      period,
      campaigns:      campaigns.length,
      inadimplentesCount: inadimplentes.length,
      proximosCount:  proximos.length,
      errors:         [r1.error, r2.error].filter(Boolean),
    });

  } catch (e: any) {
    console.error('[weekly-report]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
