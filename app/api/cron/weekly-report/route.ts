import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getDb, ensureWebhookSchema } from '@/app/lib/db';
import { fetchHotmartSales } from '@/app/lib/hotmartApi';
import { initSDK, parseMetrics, mapObjective, INSIGHT_FIELDS } from '@/app/lib/metaApi';

export const dynamic    = 'force-dynamic';
export const runtime    = 'nodejs';
export const maxDuration = 60;

const APPROVED = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

// ── Date helpers ─────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}
function fmtDate(ts: number | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function pct(n: number, d: number) { return d > 0 ? ((n / d) * 100).toFixed(1) + '%' : '0%'; }

// ── Smart AI-style insights ───────────────────────────────────────────────────
function generateTrafficInsights(campaigns: any[], totalSpend: number, totalLeads: number, totalPurchases: number): string[] {
  const insights: string[] = [];

  if (campaigns.length === 0) return ['Sem campanhas ativas no período. Considere ativar campanhas para retomar o tráfego.'];

  // ROAS analysis
  const roasCamps = campaigns.filter(c => c.revenue > 0);
  const avgRoas   = roasCamps.length > 0 ? roasCamps.reduce((s, c) => s + c.roas, 0) / roasCamps.length : 0;
  if (avgRoas >= 3) {
    insights.push(`🚀 ROAS médio de ${avgRoas.toFixed(1)}x — excelente retorno! Considere aumentar o budget das campanhas com melhor desempenho.`);
  } else if (avgRoas >= 1.5) {
    insights.push(`📈 ROAS médio de ${avgRoas.toFixed(1)}x — desempenho saudável. Há espaço para otimizar criativos e melhorar conversão.`);
  } else if (avgRoas > 0) {
    insights.push(`⚠️ ROAS médio de ${avgRoas.toFixed(1)}x — abaixo do ideal (mín. 1.5x). Revise as ofertas e segmentações das campanhas.`);
  }

  // Best performing campaign
  const bestCamp = campaigns.sort((a, b) => b.roas - a.roas)[0];
  if (bestCamp && bestCamp.roas >= 2) {
    insights.push(`🏆 Melhor campanha: "${bestCamp.name}" com ROAS de ${bestCamp.roas.toFixed(1)}x — aumente o budget para escalar os resultados.`);
  }

  // CPL analysis
  const cplCamps  = campaigns.filter(c => c.leads > 0);
  const avgCpl    = cplCamps.length > 0 ? cplCamps.reduce((s, c) => s + c.costPerLead, 0) / cplCamps.length : 0;
  if (avgCpl > 0) {
    if (avgCpl <= 30) {
      insights.push(`💡 Custo por Lead médio de ${fmtBRL(avgCpl)} — excelente (benchmark: R$ 30). Mantenha a estratégia atual.`);
    } else if (avgCpl <= 60) {
      insights.push(`💡 Custo por Lead médio de ${fmtBRL(avgCpl)} — aceitável. Teste novos criativos para reduzir o CPL.`);
    } else {
      insights.push(`🔴 Custo por Lead médio de ${fmtBRL(avgCpl)} — acima do ideal. Revise a segmentação e a página de captura.`);
    }
  }

  // Spend concentration
  const sortedBySpend = [...campaigns].sort((a, b) => b.spend - a.spend);
  if (sortedBySpend.length >= 2) {
    const topSpendPct = totalSpend > 0 ? (sortedBySpend[0].spend / totalSpend) * 100 : 0;
    if (topSpendPct > 70) {
      insights.push(`⚡ ${topSpendPct.toFixed(0)}% do budget concentrado em "${sortedBySpend[0].name}". Diversifique para reduzir o risco.`);
    }
  }

  // Volume
  if (totalLeads > 0 && totalPurchases === 0) {
    insights.push(`📊 ${totalLeads} leads gerados sem compras. Revise as páginas de venda e funil de conversão.`);
  }

  return insights.slice(0, 4); // max 4 insights
}

// ── Email HTML builder ────────────────────────────────────────────────────────
function buildEmail(data: {
  period: string;
  campaigns: any[];
  totalSpend: number;
  totalRevenue: number;
  totalLeads: number;
  totalPurchases: number;
  insights: string[];
  hotmartWeek: number;
  hotmartRevenue: number;
  proximos: any[];
  inadimplentes: any[];
  totalProximos: number;
  totalInadimplentes: number;
}): string {
  const { period, campaigns, totalSpend, totalRevenue, totalLeads, totalPurchases,
    insights, hotmartWeek, hotmartRevenue, proximos, inadimplentes,
    totalProximos, totalInadimplentes } = data;

  const roas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(1) : '—';

  const campRows = campaigns.slice(0, 8).map(c => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #1e2a3d;font-size:12px;color:#e2e8f0;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.name}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e2a3d;font-size:12px;color:#e8b14f;text-align:right;white-space:nowrap;font-weight:700">${fmtBRL(c.spend)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e2a3d;font-size:12px;color:${c.roas >= 2 ? '#4ade80' : c.roas >= 1 ? '#e8b14f' : '#f87171'};text-align:right;font-weight:900">${c.roas > 0 ? c.roas.toFixed(1) + 'x' : '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e2a3d;font-size:12px;color:#38bdf8;text-align:right">${c.leads}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e2a3d;font-size:12px;color:#a8b2c0;text-align:right">${c.costPerLead > 0 ? fmtBRL(c.costPerLead) : '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e2a3d;font-size:12px;color:#a8b2c0;text-align:right">${(c.ctr || 0).toFixed(2)}%</td>
    </tr>
  `).join('');

  const insightRows = insights.map(i => `
    <tr>
      <td style="padding:10px 14px;font-size:13px;color:#e2e8f0;line-height:1.5;border-bottom:1px solid rgba(255,255,255,0.05)">${i}</td>
    </tr>
  `).join('');

  const proximosRows = proximos.slice(0, 8).map(p => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #1e2a3d;font-size:12px;color:#e2e8f0">${p.name || p.email}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e2a3d;font-size:12px;color:#38bdf8;text-align:right;font-weight:700">${fmtBRL(p.valor || 0)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e2a3d;font-size:12px;color:#e8b14f;text-align:right">${fmtDate(p.nextMs)}</td>
    </tr>
  `).join('');

  const inadimRows = inadimplentes.slice(0, 8).map(p => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #1e2a3d;font-size:12px;color:#e2e8f0">${p.name || p.email}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e2a3d;font-size:12px;color:#f87171;text-align:right;font-weight:700">${fmtBRL(p.valor || 0)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e2a3d;font-size:12px;color:#a8b2c0;text-align:right">${p.daysSince > 0 ? p.daysSince + 'd atrás' : '—'}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>RadExperts · Relatório Semanal</title>
</head>
<body style="margin:0;padding:0;background:#070d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:680px;margin:0 auto;padding:24px 16px 48px">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0a1628 0%,#001535 50%,#0a1628 100%);border:1px solid rgba(232,177,79,0.3);border-radius:20px;padding:32px;margin-bottom:24px;text-align:center">
      <p style="font-size:10px;font-weight:900;letter-spacing:0.3em;text-transform:uppercase;color:#e8b14f;margin:0 0 10px">RadExperts · Data Center</p>
      <h1 style="font-size:28px;font-weight:900;color:#fff;margin:0 0 8px;letter-spacing:-0.02em">Relatório Semanal</h1>
      <p style="font-size:13px;color:#a8b2c0;margin:0">${period}</p>
      <div style="margin-top:20px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:center;gap:32px">
        ${[
          { label: 'Gasto Meta', val: fmtBRL(totalSpend), color: '#f97316' },
          { label: 'ROAS', val: roas + 'x', color: roas !== '—' && parseFloat(roas) >= 2 ? '#4ade80' : '#e8b14f' },
          { label: 'Receita Hotmart', val: fmtBRL(hotmartRevenue), color: '#38bdf8' },
          { label: 'Vendas', val: String(hotmartWeek), color: '#a78bfa' },
        ].map(k => `
          <div style="text-align:center">
            <p style="font-size:18px;font-weight:900;color:${k.color};margin:0">${k.val}</p>
            <p style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;color:#a8b2c0;margin:4px 0 0">${k.label}</p>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- TRÁFEGO -->
    <div style="background:#0d1526;border:1px solid rgba(255,255,255,0.08);border-radius:16px;margin-bottom:20px;overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;gap:10px">
        <div style="width:8px;height:8px;border-radius:50%;background:#f97316"></div>
        <p style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#f97316;margin:0">Tráfego — Campanhas Ativas (últimos 7 dias)</p>
      </div>

      <div style="display:flex;gap:1px;background:#1e2a3d">
        ${[
          { label: 'Gasto Total', val: fmtBRL(totalSpend), color: '#f97316' },
          { label: 'Leads', val: String(totalLeads), color: '#38bdf8' },
          { label: 'Compras', val: String(totalPurchases), color: '#4ade80' },
          { label: 'ROAS Médio', val: roas + 'x', color: '#e8b14f' },
        ].map(k => `
          <div style="flex:1;background:#0d1526;padding:14px 12px;text-align:center">
            <p style="font-size:18px;font-weight:900;color:${k.color};margin:0">${k.val}</p>
            <p style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#a8b2c0;margin:4px 0 0">${k.label}</p>
          </div>
        `).join('')}
      </div>

      ${campaigns.length > 0 ? `
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#0a1220">
            ${['Campanha','Gasto','ROAS','Leads','CPL','CTR'].map(h =>
              `<th style="padding:8px 12px;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.12em;color:#a8b2c0;text-align:${h==='Campanha'?'left':'right'}">${h}</th>`
            ).join('')}
          </tr>
        </thead>
        <tbody>${campRows}</tbody>
      </table>` : `<p style="padding:24px;color:#a8b2c0;text-align:center;font-size:13px">Sem campanhas ativas no período</p>`}
    </div>

    <!-- AI INSIGHTS -->
    <div style="background:linear-gradient(135deg,rgba(232,177,79,0.06) 0%,rgba(0,15,40,0.8) 100%);border:1px solid rgba(232,177,79,0.2);border-radius:16px;margin-bottom:20px;overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid rgba(232,177,79,0.1);display:flex;align-items:center;gap:10px">
        <div style="width:8px;height:8px;border-radius:50%;background:#e8b14f"></div>
        <p style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#e8b14f;margin:0">Insights & Análise</p>
        <span style="margin-left:auto;font-size:8px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(232,177,79,0.5);background:rgba(232,177,79,0.08);padding:3px 8px;border-radius:6px;border:1px solid rgba(232,177,79,0.15)">IA</span>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <tbody>${insightRows}</tbody>
      </table>
    </div>

    <!-- FINANCEIRO -->
    <div style="background:#0d1526;border:1px solid rgba(255,255,255,0.08);border-radius:16px;margin-bottom:20px;overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;gap:10px">
        <div style="width:8px;height:8px;border-radius:50%;background:#4ade80"></div>
        <p style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#4ade80;margin:0">Financeiro</p>
      </div>

      <!-- Próximos pagamentos -->
      <div style="padding:14px 20px 10px;border-bottom:1px solid rgba(255,255,255,0.05)">
        <p style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#38bdf8;margin:0 0 10px">Próximos Pagamentos · 7 dias · ${fmtBRL(totalProximos)}</p>
        ${proximos.length === 0 ? `<p style="color:#a8b2c0;font-size:12px;padding:4px 0">Nenhum pagamento previsto para os próximos 7 dias</p>` : `
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr><th style="padding:6px 12px;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#a8b2c0;text-align:left">Aluno</th>
            <th style="padding:6px 12px;font-size:8px;text-align:right;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#a8b2c0">Valor</th>
            <th style="padding:6px 12px;font-size:8px;text-align:right;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#a8b2c0">Vencimento</th></tr>
          </thead>
          <tbody>${proximosRows}</tbody>
        </table>`}
      </div>

      <!-- Inadimplentes -->
      <div style="padding:14px 20px 10px">
        <p style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#f87171;margin:0 0 10px">Inadimplentes · ${inadimplentes.length} aluno${inadimplentes.length !== 1 ? 's' : ''} · ${fmtBRL(totalInadimplentes)}</p>
        ${inadimplentes.length === 0 ? `<p style="color:#a8b2c0;font-size:12px;padding:4px 0">✅ Nenhum aluno inadimplente</p>` : `
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr><th style="padding:6px 12px;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#a8b2c0;text-align:left">Aluno</th>
            <th style="padding:6px 12px;font-size:8px;text-align:right;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#a8b2c0">Valor em atraso</th>
            <th style="padding:6px 12px;font-size:8px;text-align:right;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#a8b2c0">Último pag.</th></tr>
          </thead>
          <tbody>${inadimRows}</tbody>
        </table>
        ${inadimplentes.length > 8 ? `<p style="padding:8px 12px;font-size:11px;color:#a8b2c0">...e mais ${inadimplentes.length - 8} alunos inadimplentes</p>` : ''}`}
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding-top:16px">
      <p style="font-size:10px;color:#4a5568;text-transform:uppercase;letter-spacing:0.1em;margin:0">RadExperts Data Center · Relatório automático toda segunda-feira</p>
      <p style="font-size:10px;color:#4a5568;margin:6px 0 0">Para ajustar as configurações, acesse o dashboard</p>
    </div>

  </div>
</body>
</html>`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  // Protect: only allow Vercel Cron (authorization header) or manual with secret
  const authHeader  = request.headers.get('authorization');
  const cronSecret  = process.env.CRON_SECRET || '';
  const { searchParams } = new URL(request.url);
  const manualSecret = searchParams.get('secret') || '';

  const isVercelCron  = authHeader === `Bearer ${cronSecret}`;
  const isManualCall  = cronSecret && manualSecret === cronSecret;

  if (!isVercelCron && !isManualCall) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // ── Date range: last 7 days ────────────────────────────────────────────
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const toMs  = today.getTime() - 1;                     // yesterday 23:59:59
    const fromMs = toMs - 6 * 24 * 60 * 60 * 1000;        // 7 days ago

    const dateFrom = new Date(fromMs).toISOString().slice(0, 10);
    const dateTo   = new Date(toMs  ).toISOString().slice(0, 10);
    const period   = `${new Date(fromMs).toLocaleDateString('pt-BR', { day:'2-digit',month:'short' })} – ${new Date(toMs).toLocaleDateString('pt-BR', { day:'2-digit',month:'short',year:'numeric' })}`;

    // ── Meta Ads campaigns ─────────────────────────────────────────────────
    let campaigns: any[] = [];
    let totalSpend = 0, totalRevenue = 0, totalLeads = 0, totalPurchases = 0;

    try {
      const token     = process.env.META_ACCESS_TOKEN!;
      const accountId = process.env.META_AD_ACCOUNT_ID!;
      const { AdAccount } = initSDK(token);
      const account   = new AdAccount(accountId);

      const rawCampaigns = await account.getCampaigns(
        ['name', 'status'],
        { filtering: [{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }], limit: 50 }
      ) as any[];

      const insightsResults = await Promise.all(
        rawCampaigns.map(async (c: any) => {
          try {
            const ins = await c.getInsights(INSIGHT_FIELDS, {
              time_range: { since: dateFrom, until: dateTo },
              level: 'campaign',
            }) as any[];
            if (!ins || ins.length === 0) return null;
            const m = parseMetrics(ins[0]);
            return { id: c.id, name: c.name, objective: mapObjective(c.objective || ''), ...m };
          } catch { return null; }
        })
      );

      campaigns = insightsResults.filter(Boolean) as any[];
      campaigns.sort((a, b) => b.spend - a.spend);
      totalSpend     = campaigns.reduce((s, c) => s + c.spend,    0);
      totalRevenue   = campaigns.reduce((s, c) => s + c.revenue,  0);
      totalLeads     = campaigns.reduce((s, c) => s + c.leads,    0);
      totalPurchases = campaigns.reduce((s, c) => s + c.purchases,0);
    } catch (e) { console.error('[weekly-report] Meta Ads error:', e); }

    // ── Hotmart: last 7 days ──────────────────────────────────────────────
    let hotmartWeek = 0, hotmartRevenue = 0;
    try {
      const sales = await fetchHotmartSales(`${dateFrom}T00:00:00`, `${dateTo}T23:59:59`);
      const approved = sales.filter((s: any) => APPROVED.has(s.purchase?.status));
      const seenTx = new Set<string>();
      approved.forEach((s: any) => {
        const tx = s.purchase?.transaction;
        if (!tx || seenTx.has(tx)) return;
        seenTx.add(tx);
        hotmartWeek++;
        // BRL
        const isBrl = (s.purchase?.price?.currency_code || 'BRL').toUpperCase() === 'BRL';
        if (isBrl) {
          const pn = s.purchase?.producer_net;
          hotmartRevenue += pn != null ? pn : Math.max(0, (s.purchase?.price?.value ?? 0) - (s.purchase?.hotmart_fee?.total ?? 0));
        } else {
          const pnBrl = s.purchase?.producer_net_brl;
          if (pnBrl != null) { hotmartRevenue += pnBrl; }
          else {
            const converted = s.purchase?.price?.converted_value || 0;
            const feePct    = s.purchase?.hotmart_fee?.percentage ?? 0;
            hotmartRevenue += converted * (1 - feePct / 100);
          }
        }
      });
    } catch (e) { console.error('[weekly-report] Hotmart error:', e); }

    // ── Financial: próximos + inadimplentes ───────────────────────────────
    let proximos: any[] = [], inadimplentes: any[] = [];
    let totalProximos = 0, totalInadimplentes = 0;

    try {
      await ensureWebhookSchema();
      const sql  = getDb();
      const nowMs = Date.now();
      const weekAheadMs = nowMs + 7 * 24 * 60 * 60 * 1000;

      function toEpoch(v: any): number | null {
        if (!v) return null;
        const n = typeof v === 'string' ? Number(v) : Number(v);
        if (!isNaN(n) && n > 1e12) return n;
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d.getTime();
      }

      const rows = await sql`
        SELECT
          COALESCE(bp.name, ms.name, bp.email) AS name,
          bp.email,
          bp.bp_valor    AS valor,
          bp.bp_em_dia,
          bp.bp_proximo_pagamento,
          bp.bp_ultimo_pagamento
        FROM buyer_profiles bp
        LEFT JOIN manual_students ms ON LOWER(ms.email) = LOWER(bp.email)
        WHERE bp.bp_valor IS NOT NULL AND bp.bp_valor > 0
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
    } catch (e) { console.error('[weekly-report] DB error:', e); }

    // ── Generate insights ──────────────────────────────────────────────────
    const insights = generateTrafficInsights(campaigns, totalSpend, totalLeads, totalPurchases);

    // ── Build & send email ─────────────────────────────────────────────────
    const html = buildEmail({
      period, campaigns, totalSpend, totalRevenue, totalLeads, totalPurchases,
      insights, hotmartWeek, hotmartRevenue, proximos, inadimplentes,
      totalProximos, totalInadimplentes,
    });

    const resend = new Resend(process.env.RESEND_API_KEY);
    const to     = process.env.REPORT_EMAIL || 'andrecarrilho8@gmail.com';

    const { data, error } = await resend.emails.send({
      from:    'RadExperts <onboarding@resend.dev>',
      to,
      subject: `📊 Relatório Semanal RadExperts · ${period}`,
      html,
    });

    if (error) {
      console.error('[weekly-report] Resend error:', error);
      return NextResponse.json({ error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      emailId: data?.id,
      period,
      campaigns: campaigns.length,
      hotmartWeek,
      proximos: proximos.length,
      inadimplentes: inadimplentes.length,
    });

  } catch (e: any) {
    console.error('[weekly-report]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
