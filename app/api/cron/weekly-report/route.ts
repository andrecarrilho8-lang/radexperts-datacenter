import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getDb, ensureWebhookSchema } from '@/app/lib/db';
import { fetchHotmartSales } from '@/app/lib/hotmartApi';
import { initSDK, parseMetrics, INSIGHT_FIELDS } from '@/app/lib/metaApi';

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

// ── AI-style insights ─────────────────────────────────────────────────────────
function generateInsights(campaigns: any[], totalSpend: number, totalLeads: number, totalPurchases: number): string[] {
  const ins: string[] = [];
  if (!campaigns.length) return ['Nenhuma campanha com gasto no período. Verifique se as campanhas estão ativas e com budget.'];

  const avgRoas = campaigns.filter(c => c.roas > 0).reduce((s, c) => s + c.roas, 0) / (campaigns.filter(c => c.roas > 0).length || 1);
  if (avgRoas >= 3)       ins.push(`🚀 ROAS médio de ${avgRoas.toFixed(1)}x — excelente! Aumente o budget das melhores campanhas para escalar.`);
  else if (avgRoas >= 1.5) ins.push(`📈 ROAS médio de ${avgRoas.toFixed(1)}x — saudável. Há espaço para melhorar criativos e landing pages.`);
  else if (avgRoas > 0)    ins.push(`⚠️ ROAS médio de ${avgRoas.toFixed(1)}x — abaixo do ideal. Revise ofertas, criativos e segmentação.`);

  const best = [...campaigns].sort((a, b) => b.roas - a.roas)[0];
  if (best?.roas >= 2) ins.push(`🏆 Melhor campanha: "${best.name}" com ROAS ${best.roas.toFixed(1)}x e ${fmtBRL(best.spend)} investido.`);

  const cplCamps = campaigns.filter(c => c.costPerLead > 0);
  const avgCpl   = cplCamps.length ? cplCamps.reduce((s, c) => s + c.costPerLead, 0) / cplCamps.length : 0;
  if (avgCpl > 0 && avgCpl <= 30)  ins.push(`💡 CPL médio de ${fmtBRL(avgCpl)} — excelente (benchmark R$ 30). Estratégia de leads funcionando.`);
  else if (avgCpl > 30 && avgCpl <= 60) ins.push(`💡 CPL médio de ${fmtBRL(avgCpl)} — aceitável. Teste novos formatos de anúncio.`);
  else if (avgCpl > 60)             ins.push(`🔴 CPL médio de ${fmtBRL(avgCpl)} — alto. Revise segmentação e copy dos anúncios.`);

  const sorted = [...campaigns].sort((a, b) => b.spend - a.spend);
  if (sorted.length >= 2 && totalSpend > 0) {
    const topPct = (sorted[0].spend / totalSpend) * 100;
    if (topPct > 70) ins.push(`⚡ ${topPct.toFixed(0)}% do orçamento em "${sorted[0].name}". Diversifique para reduzir concentração de risco.`);
  }

  if (totalLeads > 0 && totalPurchases === 0) ins.push(`📊 ${totalLeads} leads sem compras registradas. Revise o funil de vendas e o follow-up.`);

  return ins.slice(0, 4);
}

// ── Color helper ──────────────────────────────────────────────────────────────
const ROW_BG  = '#0d1526';
const BORDER  = '#1a2540';
const SILVER  = '#a8b2c0';
const GOLD    = '#e8b14f';
const GREEN   = '#4ade80';
const BLUE    = '#38bdf8';
const RED     = '#f87171';
const ORANGE  = '#f97316';

// ── Shared email shell ────────────────────────────────────────────────────────
function shell(title: string, accentColor: string, icon: string, period: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#060c1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#060c1a;min-height:100vh">
<tr><td align="center" style="padding:32px 16px 48px">
<table width="640" cellpadding="0" cellspacing="0">

  <!-- HEADER -->
  <tr><td style="background:linear-gradient(135deg,#090f20 0%,#0c1830 100%);border:1px solid ${accentColor}40;border-radius:20px;padding:0;overflow:hidden">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:28px 32px 0;text-align:center">
        <p style="font-size:9px;font-weight:700;letter-spacing:0.35em;text-transform:uppercase;color:${accentColor};margin:0 0 8px">RadExperts · Data Center</p>
        <h1 style="font-size:26px;font-weight:900;color:#fff;margin:0 0 4px;letter-spacing:-0.02em">${icon} ${title}</h1>
        <p style="font-size:12px;color:${SILVER};margin:0 0 24px">${period}</p>
      </td></tr>
    </table>
  </td></tr>

  <tr><td height="20"></td></tr>

  ${content}

  <!-- FOOTER -->
  <tr><td style="padding:24px;text-align:center">
    <p style="font-size:9px;color:#3a4560;text-transform:uppercase;letter-spacing:0.1em;margin:0">RadExperts Data Center · Relatório automático semanal</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ── Card row (accent bar + title + number) ─────────────────────────────────────
function kpiTable(items: {label:string;val:string;color:string}[]): string {
  const cells = items.map(k =>
    `<td align="center" style="padding:18px 8px;background:${ROW_BG};border-right:1px solid ${BORDER}">
      <p style="font-size:20px;font-weight:900;color:${k.color};margin:0;line-height:1">${k.val}</p>
      <p style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;color:${SILVER};margin:5px 0 0">${k.label}</p>
    </td>`
  ).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-radius:0;overflow:hidden">
    <tr>${cells}</tr>
  </table>`;
}

// ── Section box ────────────────────────────────────────────────────────────────
function section(accentColor: string, dotColor: string, heading: string, badge: string, body: string): string {
  return `<tr><td style="background:${ROW_BG};border:1px solid ${BORDER};border-radius:16px;overflow:hidden;margin-bottom:16px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr style="background:#0a1220"><td style="padding:14px 18px">
        <table cellpadding="0" cellspacing="0"><tr>
          <td><div style="width:7px;height:7px;border-radius:50%;background:${dotColor};display:inline-block;margin-right:8px;vertical-align:middle"></div></td>
          <td style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:${dotColor};vertical-align:middle">${heading}</td>
          ${badge ? `<td align="right" style="padding-left:16px"><span style="font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${accentColor}88;background:${accentColor}12;padding:3px 8px;border-radius:6px;border:1px solid ${accentColor}25">${badge}</span></td>` : ''}
        </tr></table>
      </td></tr>
      <tr><td>${body}</td></tr>
    </table>
  </td></tr><tr><td height="16"></td></tr>`;
}

// ── TABLE header row ──────────────────────────────────────────────────────────
function thRow(cols: string[]): string {
  return `<tr style="background:#080f1e">${cols.map((c, i) =>
    `<th style="padding:8px 12px;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:${SILVER};text-align:${i===0?'left':'right'};border-bottom:1px solid ${BORDER}">${c}</th>`
  ).join('')}</tr>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// EMAIL 1: TRÁFEGO
// ──────────────────────────────────────────────────────────────────────────────
function buildTrafficEmail(data: {
  period: string;
  campaigns: any[];
  totalSpend: number;
  totalRevenue: number;
  totalLeads: number;
  totalPurchases: number;
  hotmartWeek: number;
  hotmartRevenue: number;
  insights: string[];
}): string {
  const { period, campaigns, totalSpend, totalRevenue, totalLeads, totalPurchases, hotmartWeek, hotmartRevenue, insights } = data;
  const roas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(1) : '—';

  const campRows = campaigns.length === 0
    ? `<tr><td colspan="6" style="padding:24px;text-align:center;color:${SILVER};font-size:12px">Nenhuma campanha com gasto no período</td></tr>`
    : campaigns.slice(0, 10).map((c, i) => `
      <tr style="background:${i%2===0?ROW_BG:'#0a1220'}">
        <td style="padding:10px 12px;font-size:11px;color:#e2e8f0;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-bottom:1px solid ${BORDER}">${c.name}</td>
        <td style="padding:10px 12px;font-size:11px;color:${ORANGE};font-weight:700;text-align:right;white-space:nowrap;border-bottom:1px solid ${BORDER}">${fmtBRL(c.spend)}</td>
        <td style="padding:10px 12px;font-size:12px;color:${c.roas>=2?GREEN:c.roas>=1?GOLD:RED};font-weight:900;text-align:right;border-bottom:1px solid ${BORDER}">${c.roas>0?c.roas.toFixed(1)+'x':'—'}</td>
        <td style="padding:10px 12px;font-size:11px;color:${BLUE};text-align:right;border-bottom:1px solid ${BORDER}">${c.leads}</td>
        <td style="padding:10px 12px;font-size:11px;color:${SILVER};text-align:right;border-bottom:1px solid ${BORDER}">${c.costPerLead>0?fmtBRL(c.costPerLead):'—'}</td>
        <td style="padding:10px 12px;font-size:11px;color:${SILVER};text-align:right;border-bottom:1px solid ${BORDER}">${(c.ctr||0).toFixed(2)}%</td>
      </tr>`).join('');

  const insightRows = insights.map(ins =>
    `<tr><td style="padding:12px 18px;font-size:12px;color:#d8e0ec;line-height:1.6;border-bottom:1px solid #141f35">${ins}</td></tr>`
  ).join('');

  const kpis = kpiTable([
    { label: 'Gasto Meta', val: fmtBRL(totalSpend), color: ORANGE },
    { label: 'ROAS', val: roas === '—' ? '—' : roas + 'x', color: parseFloat(roas||'0')>=2?GREEN:GOLD },
    { label: 'Leads', val: String(totalLeads), color: BLUE },
    { label: 'Compras', val: String(totalPurchases), color: GREEN },
    { label: 'Receita Hotmart', val: fmtBRL(hotmartRevenue), color: BLUE },
    { label: 'Vendas na Semana', val: String(hotmartWeek), color: '#a78bfa' },
  ]);

  const content = `
    <!-- KPIs -->
    <tr><td style="background:#090f1f;border:1px solid ${BORDER};border-radius:16px;overflow:hidden;margin-bottom:16px">
      ${kpis}
    </td></tr>
    <tr><td height="16"></td></tr>

    ${section(ORANGE, ORANGE, 'Campanhas Meta Ads · Últimos 7 dias', '',
      `<table width="100%" cellpadding="0" cellspacing="0">
        ${thRow(['Campanha','Gasto','ROAS','Leads','CPL','CTR'])}
        <tbody>${campRows}</tbody>
      </table>`
    )}

    ${section(GOLD, GOLD, 'Insights & Análise', 'IA',
      `<table width="100%" cellpadding="0" cellspacing="0"><tbody>${insightRows}</tbody></table>`
    )}
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
    : proximos.slice(0, 15).map((p, i) => `
      <tr style="background:${i%2===0?ROW_BG:'#0a1220'}">
        <td style="padding:10px 12px;font-size:11px;color:#e2e8f0;border-bottom:1px solid ${BORDER}">${p.name || p.email}</td>
        <td style="padding:10px 12px;font-size:11px;color:${BLUE};text-align:right;font-weight:700;border-bottom:1px solid ${BORDER}">${fmtBRL(p.valor||0)}</td>
        <td style="padding:10px 12px;font-size:11px;color:${GOLD};text-align:right;border-bottom:1px solid ${BORDER}">${fmtDate(p.nextMs)}</td>
      </tr>`).join('');

  const inadimRows = inadimplentes.length === 0
    ? `<tr><td colspan="3" style="padding:20px;text-align:center;color:${GREEN};font-size:12px">✅ Nenhum aluno inadimplente!</td></tr>`
    : inadimplentes.slice(0, 15).map((p, i) => `
      <tr style="background:${i%2===0?ROW_BG:'#0a1220'}">
        <td style="padding:10px 12px;font-size:11px;color:#e2e8f0;border-bottom:1px solid ${BORDER}">${p.name || p.email}</td>
        <td style="padding:10px 12px;font-size:11px;color:${RED};text-align:right;font-weight:700;border-bottom:1px solid ${BORDER}">${fmtBRL(p.valor||0)}</td>
        <td style="padding:10px 12px;font-size:11px;color:${SILVER};text-align:right;border-bottom:1px solid ${BORDER}">${p.daysSince > 0 ? p.daysSince + 'd em atraso' : '—'}</td>
      </tr>`).join('');

  const moreInadim = inadimplentes.length > 15
    ? `<tr><td colspan="3" style="padding:10px 12px;font-size:10px;color:${SILVER};text-align:center">+ ${inadimplentes.length-15} alunos não listados</td></tr>`
    : '';

  const content = `
    <!-- KPIs semana -->
    <tr><td style="background:#090f1f;border:1px solid ${BORDER};border-radius:16px;overflow:hidden">
      ${kpiTable([
        { label: 'Receita Hotmart (liq.)', val: fmtBRL(hotmartRevenue), color: BLUE },
        { label: 'Vendas na Semana', val: String(hotmartWeek), color: '#a78bfa' },
        { label: 'A Receber (7 dias)', val: fmtBRL(totalProximos), color: GREEN },
        { label: 'Total Inadimplente', val: fmtBRL(totalInadimplentes), color: inadimplentes.length > 0 ? RED : GREEN },
      ])}
    </td></tr>
    <tr><td height="16"></td></tr>

    ${section(BLUE, BLUE, `Próximos Pagamentos · 7 dias · ${proximos.length} alunos`, '',
      `<table width="100%" cellpadding="0" cellspacing="0">
        ${thRow(['Aluno','Valor','Vencimento'])}
        <tbody>${proximosRows}${proximos.length>15?`<tr><td colspan="3" style="padding:10px 12px;font-size:10px;color:${SILVER};text-align:center">+ ${proximos.length-15} pagamentos não listados</td></tr>`:''}</tbody>
      </table>`
    )}

    ${section(RED, RED, `Inadimplentes · ${inadimplentes.length} aluno${inadimplentes.length!==1?'s':''} · ${fmtBRL(totalInadimplentes)}`, '',
      `<table width="100%" cellpadding="0" cellspacing="0">
        ${thRow(['Aluno','Valor em Atraso','Inadimplência'])}
        <tbody>${inadimRows}${moreInadim}</tbody>
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

    // ── META ADS: account-level insights by campaign ───────────────────────
    let campaigns: any[] = [];
    let totalSpend = 0, totalRevenue = 0, totalLeads = 0, totalPurchases = 0;
    try {
      const { AdAccount } = initSDK(process.env.META_ACCESS_TOKEN!);
      const account    = new AdAccount(process.env.META_AD_ACCOUNT_ID!);

      // Get insights at ACCOUNT level broken down by campaign — this returns
      // all campaigns that had ANY spend in the date range, regardless of current status
      const insights = await account.getInsights(
        [...INSIGHT_FIELDS, 'cpm'],
        {
          time_range: { since: dateFrom, until: dateTo },
          level: 'campaign',
          limit: 100,
        }
      ) as any[];

      const seenCamp = new Set<string>();
      for (const row of insights) {
        const id = row.campaign_id || row._data?.campaign_id;
        if (!id || seenCamp.has(id)) continue;
        seenCamp.add(id);
        const m    = parseMetrics(row._data || row);
        const name = row.campaign_name || row._data?.campaign_name || `Campanha ${id}`;
        if (m.spend > 0) campaigns.push({ id, name, ...m });
      }
      campaigns.sort((a, b) => b.spend - a.spend);
      totalSpend     = campaigns.reduce((s, c) => s + c.spend,    0);
      totalRevenue   = campaigns.reduce((s, c) => s + c.revenue,  0);
      totalLeads     = campaigns.reduce((s, c) => s + c.leads,    0);
      totalPurchases = campaigns.reduce((s, c) => s + c.purchases,0);
    } catch (e: any) { console.error('[weekly] Meta Ads error:', e?.message || e); }

    // ── HOTMART: last 7 days ───────────────────────────────────────────────
    let hotmartWeek = 0, hotmartRevenue = 0;
    try {
      const sales    = await fetchHotmartSales(`${dateFrom}T00:00:00`, `${dateTo}T23:59:59`);
      const approved = sales.filter((s: any) => APPROVED.has(s.purchase?.status));
      const seenTx   = new Set<string>();
      approved.forEach((s: any) => {
        const tx = s.purchase?.transaction;
        if (!tx || seenTx.has(tx)) return;
        seenTx.add(tx);
        hotmartWeek++;
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
    } catch (e: any) { console.error('[weekly] Hotmart error:', e?.message || e); }

    // ── FINANCEIRO: próximos + inadimplentes ──────────────────────────────
    // DISTINCT ON (email) to prevent duplicates when an email has
    // multiple manual_students rows (enrolled in multiple courses)
    let proximos: any[] = [], inadimplentes: any[] = [];
    let totalProximos = 0, totalInadimplentes = 0;
    try {
      await ensureWebhookSchema();
      const sql    = getDb();
      const nowMs  = Date.now();
      const weekAheadMs = nowMs + 7 * 24 * 60 * 60 * 1000;

      function toEpoch(v: any): number | null {
        if (!v) return null;
        const n = typeof v === 'string' ? Number(v) : Number(v);
        if (!isNaN(n) && n > 1e12) return n;
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d.getTime();
      }

      // DISTINCT ON (bp.email) eliminates duplicates from multi-course enrollments
      const rows = await sql`
        SELECT DISTINCT ON (bp.email)
          COALESCE(bp.name, bp.email)   AS name,
          bp.email,
          bp.bp_valor::numeric          AS valor,
          bp.bp_em_dia,
          bp.bp_proximo_pagamento,
          bp.bp_ultimo_pagamento
        FROM buyer_profiles bp
        WHERE bp.bp_valor IS NOT NULL
          AND bp.bp_valor::numeric > 0
        ORDER BY bp.email, bp.updated_at DESC NULLS LAST
      ` as any[];

      rows.forEach((row: any) => {
        const nextMs   = toEpoch(row.bp_proximo_pagamento);
        const lastMs   = toEpoch(row.bp_ultimo_pagamento);
        const emDia    = (row.bp_em_dia || '').toUpperCase().trim();
        const valor    = Number(row.valor) || 0;
        const daysSince = lastMs ? Math.floor((nowMs - lastMs) / 86_400_000) : 0;

        if (emDia === 'INADIMPLENTE') {
          inadimplentes.push({ name: row.name, email: row.email, valor, daysSince });
          totalInadimplentes += valor;
        } else if (nextMs && nextMs >= nowMs && nextMs <= weekAheadMs) {
          proximos.push({ name: row.name, email: row.email, valor, nextMs });
          totalProximos += valor;
        }
      });

      proximos.sort((a, b) => a.nextMs - b.nextMs);
      inadimplentes.sort((a, b) => b.daysSince - a.daysSince);
    } catch (e: any) { console.error('[weekly] DB error:', e?.message || e); }

    // ── Send emails ────────────────────────────────────────────────────────
    const resend  = new Resend(process.env.RESEND_API_KEY);
    const to      = process.env.REPORT_EMAIL || 'andrecarrilho8@gmail.com';
    const insights = generateInsights(campaigns, totalSpend, totalLeads, totalPurchases);

    const [r1, r2] = await Promise.all([
      resend.emails.send({
        from:    'RadExperts <onboarding@resend.dev>',
        to,
        subject: `📊 Tráfego · ${period}`,
        html:    buildTrafficEmail({ period, campaigns, totalSpend, totalRevenue, totalLeads, totalPurchases, hotmartWeek, hotmartRevenue, insights }),
      }),
      resend.emails.send({
        from:    'RadExperts <onboarding@resend.dev>',
        to,
        subject: `💰 Financeiro · ${period}`,
        html:    buildFinanceiroEmail({ period, hotmartWeek, hotmartRevenue, proximos, inadimplentes, totalProximos, totalInadimplentes }),
      }),
    ]);

    if (r1.error || r2.error) {
      console.error('[weekly] Resend errors:', r1.error, r2.error);
    }

    return NextResponse.json({
      ok:             !r1.error && !r2.error,
      trafficEmailId: r1.data?.id,
      financeEmailId: r2.data?.id,
      period,
      campaigns:      campaigns.length,
      hotmartWeek,
      proximos:       proximos.length,
      inadimplentes:  inadimplentes.length,
    });

  } catch (e: any) {
    console.error('[weekly-report]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
