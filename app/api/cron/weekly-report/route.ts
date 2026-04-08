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
const fmtBRL  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const fmtDate = (ts: number | null) => ts ? new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

// ── Map campaign objective from name (Portuguese naming convention) ───────────
function detectObjective(name: string): 'LEADS' | 'VENDAS' | 'OUTROS' {
  const u = (name || '').toUpperCase();
  // Meta API objective values
  if (u.includes('LEAD_GENERATION') || u.includes('OUTCOME_LEADS')) return 'LEADS';
  if (u.includes('OUTCOME_SALES')   || u.includes('CONVERSIONS'))   return 'VENDAS';
  // Portuguese campaign name conventions
  if (u.includes('_LEADS_') || u.startsWith('LEADS_') || u.endsWith('_LEADS')) return 'LEADS';
  if (u.includes('LEADS_') || u.includes('_LEADS'))   return 'LEADS';
  if (u.includes('VENDA')  || u.includes('VENDAS'))   return 'VENDAS';
  if (u.includes('CONVER') || u.includes('PURCHASE'))  return 'VENDAS';
  return 'OUTROS';
}

// ── Per-campaign insight text ─────────────────────────────────────────────────
function campaignInsight(c: any): string {
  const parts: string[] = [];
  if (c.leads > 0) {
    if (c.costPerLead <= 20)      parts.push(`CPL de ${fmtBRL(c.costPerLead)} — excelente (meta: R$30).`);
    else if (c.costPerLead <= 40) parts.push(`CPL de ${fmtBRL(c.costPerLead)} — aceitável.`);
    else                          parts.push(`CPL de ${fmtBRL(c.costPerLead)} — alto, revise segmentação e copy.`);
    parts.push(`${c.leads} lead${c.leads>1?'s':''} gerado${c.leads>1?'s':''}.`);
  } else if (c.objective === 'LEADS') {
    parts.push('Sem leads registrados — verifique o pixel e o objetivo da campanha.');
  }
  if (c.purchases > 0) {
    parts.push(`${c.purchases} venda${c.purchases>1?'s':''} com CPA de ${fmtBRL(c.cpa)}.`);
  }
  if (c.ctr > 0) {
    if (c.ctr >= 2)       parts.push(`CTR de ${c.ctr.toFixed(2)}% — alto engajamento dos criativos.`);
    else if (c.ctr < 0.8) parts.push(`CTR de ${c.ctr.toFixed(2)}% — baixo. Teste novos formatos de criativo.`);
    else                  parts.push(`CTR de ${c.ctr.toFixed(2)}%.`);
  }
  if (c.cpm > 50) parts.push(`CPM de ${fmtBRL(c.cpm)} — audiência cara, considere ampliar a segmentação.`);
  if (c.connectRate > 0 && c.connectRate < 50 && c.outboundClicks > 10)
    parts.push(`Taxa de conexão de ${c.connectRate.toFixed(0)}% — landing page com problemas de velocidade ou relevância.`);
  if (c.spend > 2000) parts.push(`Budget alto (${fmtBRL(c.spend)}) — monitore o ROI de perto.`);
  if (!parts.length)    parts.push(`Gasto de ${fmtBRL(c.spend)} sem resultados registrados no pixel.`);
  return parts.join(' ');
}

// ── Summary insights ──────────────────────────────────────────────────────────
function summaryInsights(camps: any[], totalSpend: number, totalLeads: number, totalPurchases: number): string[] {
  const ins: string[] = [];
  if (!camps.length) { ins.push('Nenhuma campanha com gasto no período.'); return ins; }
  const leadC  = camps.filter(c => c.objective === 'LEADS');
  const salesC = camps.filter(c => c.objective === 'VENDAS');
  const lSpend = leadC.reduce((s,c)=>s+c.spend,0), sSpend = salesC.reduce((s,c)=>s+c.spend,0);
  ins.push(`💰 Gasto total: ${fmtBRL(totalSpend)} — ${totalSpend>0?Math.round(lSpend/totalSpend*100):0}% Leads, ${totalSpend>0?Math.round(sSpend/totalSpend*100):0}% Vendas.`);
  const cplC = leadC.filter(c=>c.costPerLead>0);
  const avgCpl = cplC.length ? cplC.reduce((s,c)=>s+c.costPerLead,0)/cplC.length : 0;
  if (avgCpl>0) {
    if (avgCpl<=25)      ins.push(`🟢 CPL médio de ${fmtBRL(avgCpl)} — excelente eficiência de captação.`);
    else if (avgCpl<=50) ins.push(`🟡 CPL médio de ${fmtBRL(avgCpl)} — aceitável, mas há margem de otimização.`);
    else                 ins.push(`🔴 CPL médio de ${fmtBRL(avgCpl)} — revise segmentação e criativos urgentemente.`);
  }
  const bestLeads = [...leadC].sort((a,b)=>b.leads-a.leads)[0];
  if (bestLeads?.leads>0) ins.push(`🏆 Melhor captação: "${bestLeads.name}" (${bestLeads.leads} leads a ${fmtBRL(bestLeads.costPerLead)} cada).`);
  const bestSales = [...salesC].sort((a,b)=>b.purchases-a.purchases)[0];
  if (bestSales?.purchases>0) ins.push(`🛒 Melhor venda: "${bestSales.name}" (${bestSales.purchases} compra${bestSales.purchases>1?'s':''}, CPA ${fmtBRL(bestSales.cpa)}).`);
  if (totalLeads===0 && totalPurchases===0) ins.push('⚠️ Nenhum resultado (lead/venda) registrado. Verifique pixels e objetivos.');
  return ins.slice(0,5);
}

// ── Email primitives ──────────────────────────────────────────────────────────
const BG='#060c1a', ROW='#0d1526', BDR='#1a2540', SIL='#a8b2c0';
const GOLD='#e8b14f', GRN='#4ade80', BLUE='#38bdf8', RED='#f87171', ORG='#f97316', PUR='#a78bfa';

function shell(title:string,accent:string,icon:string,period:string,body:string):string{return`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BG}">
<tr><td align="center" style="padding:28px 12px 48px">
<table width="620" cellpadding="0" cellspacing="0">
<tr><td style="background:linear-gradient(135deg,#090f20,#0d1c38);border:1px solid ${accent}40;border-radius:18px;padding:26px 28px;text-align:center">
  <p style="font-size:9px;font-weight:700;letter-spacing:0.35em;text-transform:uppercase;color:${accent};margin:0 0 6px">RadExperts · Data Center</p>
  <h1 style="font-size:24px;font-weight:900;color:#fff;margin:0 0 4px">${icon} ${title}</h1>
  <p style="font-size:11px;color:${SIL};margin:0">${period}</p>
</td></tr>
<tr><td height="18"></td></tr>
${body}
<tr><td style="padding:20px;text-align:center"><p style="font-size:9px;color:#2d3a55;text-transform:uppercase;letter-spacing:0.1em;margin:0">RadExperts · Relatório automático toda segunda-feira</p></td></tr>
</table></td></tr></table></body></html>`;}

function kpis(items:{l:string;v:string;c:string}[]):string{
  return`<tr><td style="background:#090f1f;border:1px solid ${BDR};border-radius:14px;overflow:hidden"><table width="100%" cellpadding="0" cellspacing="0"><tr>${
    items.map(k=>`<td align="center" style="padding:15px 6px;border-right:1px solid ${BDR}">
      <p style="font-size:18px;font-weight:900;color:${k.c};margin:0;line-height:1">${k.v}</p>
      <p style="font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:${SIL};margin:4px 0 0">${k.l}</p>
    </td>`).join('')}
  </tr></table></td></tr><tr><td height="14"></td></tr>`;}

function box(dot:string,title:string,badge:string,body:string):string{
  return`<tr><td style="background:${ROW};border:1px solid ${BDR};border-radius:14px;overflow:hidden">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr style="background:#0a1220"><td style="padding:12px 16px">
        <table cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;padding-right:8px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${dot}"></span></td>
          <td style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.14em;color:${dot};vertical-align:middle">${title}</td>
          ${badge?`<td style="padding-left:10px"><span style="font-size:7px;font-weight:700;text-transform:uppercase;color:${dot}80;background:${dot}10;padding:2px 7px;border-radius:4px;border:1px solid ${dot}20">${badge}</span></td>`:''}
        </tr></table>
      </td></tr>
      <tr><td>${body}</td></tr>
    </table>
  </td></tr><tr><td height="14"></td></tr>`;}

function th(cols:{l:string;r?:boolean}[]):string{
  return`<tr style="background:#08111f">${cols.map(c=>`<th style="padding:7px 12px;font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:${SIL};text-align:${c.r?'right':'left'};border-bottom:1px solid ${BDR}">${c.l}</th>`).join('')}</tr>`;}

// ── Camp table per group ──────────────────────────────────────────────────────
function campRows(camps:any[], showLeads:boolean, showPurch:boolean):string{
  if(!camps.length) return`<tr><td style="padding:16px;text-align:center;color:${SIL};font-size:11px">Nenhuma campanha nesta categoria</td></tr>`;
  const cols:{l:string;r?:boolean}[] = [{l:'Campanha'},{l:'Gasto',r:true}];
  if(showLeads)  cols.push({l:'Leads',r:true},{l:'CPL',r:true});
  if(showPurch)  cols.push({l:'Compras',r:true},{l:'CPA',r:true});
  cols.push({l:'CTR',r:true});
  const rows = camps.map((c,i)=>{
    const tds = [`<td style="padding:9px 12px;font-size:10px;color:#dde6f5;border-bottom:1px solid ${BDR};max-width:190px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name}</td>`,
      `<td style="padding:9px 12px;font-size:10px;color:${ORG};font-weight:700;text-align:right;border-bottom:1px solid ${BDR};white-space:nowrap">${fmtBRL(c.spend)}</td>`];
    if(showLeads){ tds.push(`<td style="padding:9px 12px;font-size:10px;color:${BLUE};text-align:right;border-bottom:1px solid ${BDR}">${c.leads||0}</td>`);
      tds.push(`<td style="padding:9px 12px;font-size:10px;color:${c.costPerLead>0?(c.costPerLead<=30?GRN:c.costPerLead<=60?GOLD:RED):SIL};text-align:right;border-bottom:1px solid ${BDR}">${c.costPerLead>0?fmtBRL(c.costPerLead):'—'}</td>`); }
    if(showPurch){ tds.push(`<td style="padding:9px 12px;font-size:10px;color:${GRN};text-align:right;border-bottom:1px solid ${BDR}">${c.purchases||0}</td>`);
      tds.push(`<td style="padding:9px 12px;font-size:10px;color:${c.cpa>0?GOLD:SIL};text-align:right;border-bottom:1px solid ${BDR}">${c.cpa>0?fmtBRL(c.cpa):'—'}</td>`); }
    tds.push(`<td style="padding:9px 12px;font-size:10px;color:${SIL};text-align:right;border-bottom:1px solid ${BDR}">${(c.ctr||0).toFixed(2)}%</td>`);
    return`<tr style="background:${i%2===0?ROW:'#0a1220'}">${tds.join('')}</tr>`;
  }).join('');
  return`<table width="100%" cellpadding="0" cellspacing="0">${th(cols)}<tbody>${rows}</tbody></table>`;}

// ── EMAIL 1: TRÁFEGO ──────────────────────────────────────────────────────────
function buildTraffic(period:string, camps:any[], totalSpend:number, totalLeads:number, totalPurchases:number):string{
  const leadC  = camps.filter(c=>c.objective==='LEADS');
  const salesC = camps.filter(c=>c.objective==='VENDAS');
  const othrC  = camps.filter(c=>c.objective==='OUTROS');
  const sumIns = summaryInsights(camps, totalSpend, totalLeads, totalPurchases);

  const detailRows = camps.map(c=>`
    <tr style="border-bottom:1px solid ${BDR}"><td style="padding:12px 16px">
      <p style="font-size:10px;font-weight:900;color:${c.objective==='LEADS'?BLUE:c.objective==='VENDAS'?GRN:SIL};margin:0 0 3px;text-transform:uppercase;letter-spacing:0.05em">${c.name}</p>
      <p style="font-size:11px;color:#bbc8de;margin:0;line-height:1.55">${campaignInsight(c)}</p>
    </td></tr>`).join('');

  const content = [
    kpis([{l:'Gasto Total',v:fmtBRL(totalSpend),c:ORG},{l:'Leads',v:String(totalLeads),c:BLUE},{l:'Compras',v:String(totalPurchases),c:GRN},{l:'Campanhas',v:String(camps.length),c:PUR}]),
    box(GOLD,'Resumo Geral','IA',`<table width="100%" cellpadding="0" cellspacing="0"><tbody>${sumIns.map(s=>`<tr><td style="padding:10px 16px;font-size:11px;color:#cddcf2;line-height:1.6;border-bottom:1px solid #111b30">${s}</td></tr>`).join('')}</tbody></table>`),
    leadC.length  ? box(BLUE, `Campanhas de Leads (${leadC.length})`,'',campRows(leadC,true,false)) : '',
    salesC.length ? box(GRN,  `Campanhas de Vendas (${salesC.length})`,'',campRows(salesC,false,true)) : '',
    othrC.length  ? box(SIL,  `Outras Campanhas (${othrC.length})`,'',campRows(othrC,false,false)) : '',
    camps.length  ? box(GOLD,'Análise Detalhada por Campanha','IA',`<table width="100%" cellpadding="0" cellspacing="0"><tbody>${detailRows}</tbody></table>`) : '',
  ].join('');

  return shell('Relatório de Tráfego', ORG, '📊', period, content);
}

// ── EMAIL 2: FINANCEIRO ───────────────────────────────────────────────────────
function buildFinanceiro(period:string, hotmartWeek:number, hotmartRevenue:number,
  upcoming:any[], overdue:any[], totalUpcoming:number, totalOverdue:number):string{

  const upRows = upcoming.length===0
    ? `<tr><td colspan="3" style="padding:18px;text-align:center;color:${SIL};font-size:11px">Nenhum pagamento previsto para os próximos 7 dias</td></tr>`
    : upcoming.slice(0,25).map((p,i)=>`<tr style="background:${i%2===0?ROW:'#0a1220'}">
        <td style="padding:9px 12px;font-size:10px;color:#dde6f5;border-bottom:1px solid ${BDR}">${p.name}</td>
        <td style="padding:9px 12px;font-size:10px;color:${BLUE};font-weight:700;text-align:right;border-bottom:1px solid ${BDR};white-space:nowrap">${fmtBRL(p.amount||0)}</td>
        <td style="padding:9px 12px;font-size:10px;color:${GOLD};text-align:right;border-bottom:1px solid ${BDR}">${fmtDate(p.dueDate)}</td>
      </tr>`).join('');

  const ovRows = overdue.length===0
    ? `<tr><td colspan="3" style="padding:18px;text-align:center;color:${GRN};font-size:11px">✅ Nenhum aluno inadimplente</td></tr>`
    : overdue.slice(0,25).map((p,i)=>`<tr style="background:${i%2===0?ROW:'#0a1220'}">
        <td style="padding:9px 12px;font-size:10px;color:#dde6f5;border-bottom:1px solid ${BDR}">${p.name}</td>
        <td style="padding:9px 12px;font-size:10px;color:${RED};font-weight:700;text-align:right;border-bottom:1px solid ${BDR};white-space:nowrap">${fmtBRL(p.amount||0)}</td>
        <td style="padding:9px 12px;font-size:10px;color:${SIL};text-align:right;border-bottom:1px solid ${BDR}">${p.daysOverdue>0?p.daysOverdue+'d em atraso':'Inadimplente'}</td>
      </tr>`).join('');

  const content = [
    kpis([{l:'Receita Hotmart (liq.)',v:fmtBRL(hotmartRevenue),c:BLUE},{l:'Vendas Semana',v:String(hotmartWeek),c:PUR},{l:'A Receber (7d)',v:fmtBRL(totalUpcoming),c:GRN},{l:'Em Atraso',v:fmtBRL(totalOverdue),c:overdue.length>0?RED:GRN}]),
    box(BLUE,`Próximos Pagamentos · ${upcoming.length} alunos · ${fmtBRL(totalUpcoming)}`,'',
      `<table width="100%" cellpadding="0" cellspacing="0">${th([{l:'Aluno'},{l:'Valor',r:true},{l:'Vencimento',r:true}])}<tbody>${upRows}${upcoming.length>25?`<tr><td colspan="3" style="padding:8px;text-align:center;font-size:9px;color:${SIL}">+${upcoming.length-25} pagamentos</td></tr>`:''}</tbody></table>`),
    box(RED,`Inadimplentes · ${overdue.length} aluno${overdue.length!==1?'s':''} · ${fmtBRL(totalOverdue)}`,'',
      `<table width="100%" cellpadding="0" cellspacing="0">${th([{l:'Aluno'},{l:'Valor',r:true},{l:'Status',r:true}])}<tbody>${ovRows}${overdue.length>25?`<tr><td colspan="3" style="padding:8px;text-align:center;font-size:9px;color:${SIL}">+${overdue.length-25} alunos</td></tr>`:''}</tbody></table>`),
  ].join('');

  return shell('Relatório Financeiro', GRN, '💰', period, content);}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const authHeader   = request.headers.get('authorization');
  const cronSecret   = process.env.CRON_SECRET || '';
  const { searchParams } = new URL(request.url);
  if (authHeader !== `Bearer ${cronSecret}` && (!cronSecret || searchParams.get('secret') !== cronSecret))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const now    = new Date();
    const today  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const toMs   = today.getTime() - 1;
    const fromMs = toMs - 6 * 24 * 60 * 60 * 1000;
    const dateFrom = new Date(fromMs).toISOString().slice(0,10);
    const dateTo   = new Date(toMs  ).toISOString().slice(0,10);
    const nowMs    = Date.now();
    const weekAheadMs = nowMs + 7 * 24 * 60 * 60 * 1000;
    const period = `${new Date(fromMs).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} – ${new Date(toMs).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}`;

    // ── META ADS ──────────────────────────────────────────────────────────
    let campaigns:any[]=[], totalSpend=0, totalLeads=0, totalPurchases=0;
    try {
      const {AdAccount} = initSDK(process.env.META_ACCESS_TOKEN!);
      const account = new AdAccount(process.env.META_AD_ACCOUNT_ID!);
      const insights = await account.getInsights([...INSIGHT_FIELDS,'cpm'],{time_range:{since:dateFrom,until:dateTo},level:'campaign',limit:100});
      const seen = new Set<string>();
      for(const row of insights){
        const r=row as any, id=r.campaign_id, name=r.campaign_name||`Campanha ${id}`;
        if(!id||seen.has(id)) continue; seen.add(id);
        const m=parseMetrics(r), obj=detectObjective(name);
        if(m.spend>0) campaigns.push({id,name,objective:obj,...m});
      }
      campaigns.sort((a,b)=>b.spend-a.spend);
      totalSpend=campaigns.reduce((s,c)=>s+c.spend,0);
      totalLeads=campaigns.reduce((s,c)=>s+c.leads,0);
      totalPurchases=campaigns.reduce((s,c)=>s+c.purchases,0);
    } catch(e:any){console.error('[weekly] Meta:',e?.message);}

    // ── HOTMART ───────────────────────────────────────────────────────────
    let hotmartWeek=0, hotmartRevenue=0;
    try {
      const sales=await fetchHotmartSales(`${dateFrom}T00:00:00`,`${dateTo}T23:59:59`);
      const seenTx=new Set<string>();
      sales.filter((s:any)=>APPROVED.has(s.purchase?.status)).forEach((s:any)=>{
        const tx=s.purchase?.transaction; if(!tx||seenTx.has(tx)) return; seenTx.add(tx); hotmartWeek++;
        const isBrl=(s.purchase?.price?.currency_code||'BRL').toUpperCase()==='BRL';
        if(isBrl){ const pn=s.purchase?.producer_net; hotmartRevenue+=pn!=null?pn:Math.max(0,(s.purchase?.price?.value??0)-(s.purchase?.hotmart_fee?.total??0)); }
        else { const pnBrl=s.purchase?.producer_net_brl; if(pnBrl!=null) hotmartRevenue+=pnBrl; else hotmartRevenue+=(s.purchase?.price?.converted_value||0)*(1-(s.purchase?.hotmart_fee?.percentage??0)/100); }
      });
    } catch(e:any){console.error('[weekly] Hotmart:',e?.message);}

    // ── FINANCEIRO: replica exatamente a lógica do /api/financeiro/overview ──
    let upcoming:any[]=[], overdue:any[]=[], totalUpcoming=0, totalOverdue=0;
    try {
      await ensureWebhookSchema();
      const db = getDb();

      function toEpochMs(val:any):number{
        if(!val) return 0;
        const n=Number(val);
        if(!isNaN(n)&&n>1_000_000_000_000) return n;
        if(!isNaN(n)&&n>0&&n<1_000_000_000_000) return n*1000;
        const d=new Date(val); return isNaN(d.getTime())?0:d.getTime();
      }

      // Same query as financeiro overview route
      const rows = await db`
        SELECT ms.id, ms.name, ms.email, ms.course_name,
               ms.payment_type, ms.total_amount, ms.installments,
               ms.installment_amount, ms.installment_dates,
               bp.bp_proximo_pagamento, bp.bp_em_dia, bp.bp_ultimo_pagamento
        FROM manual_students ms
        LEFT JOIN buyer_profiles bp ON LOWER(bp.email) = LOWER(ms.email)
        WHERE COALESCE(ms.total_amount, 0) > 0
        ORDER BY ms.entry_date DESC
      ` as any[];

      const seenOverdue = new Set<string>();

      for(const row of rows){
        const name     = (row.name||'—').toUpperCase();
        const email    = (row.email||'').toLowerCase().trim();
        const instAmt  = Number(row.installment_amount)||Number(row.total_amount)||0;
        const totalInst = Number(row.installments)||1;
        const emUp     = (row.bp_em_dia||'').toUpperCase().trim();
        const isInadim = emUp==='NÃO'||emUp==='NAO'||emUp==='INADIMPLENTE';

        let instDates:any[]=[];
        try{ const raw=typeof row.installment_dates==='string'?JSON.parse(row.installment_dates):(row.installment_dates||[]); if(Array.isArray(raw)) instDates=raw; }catch{}

        const paidCount=instDates.filter((d:any)=>d.paid).length;

        if(totalInst===1||instDates.length===0){
          // Single payment — use bp_proximo_pagamento
          const nextMs=toEpochMs(row.bp_proximo_pagamento);
          if(nextMs>nowMs&&nextMs<=weekAheadMs){
            upcoming.push({name,email,amount:instAmt,dueDate:nextMs});
            totalUpcoming+=instAmt;
          } else if(nextMs>0&&nextMs<=nowMs&&isInadim){
            if(!seenOverdue.has(email)){ seenOverdue.add(email);
              const daysOverdue=Math.floor((nowMs-nextMs)/86_400_000);
              overdue.push({name,email,amount:instAmt,dueDate:nextMs,daysOverdue});
              totalOverdue+=instAmt;
            }
          }
        } else {
          // Installment-based: find next unpaid
          const unpaid=instDates.map((d:any,i:number)=>({...d,idx:i})).filter((d:any)=>!d.paid);
          const next=unpaid.sort((a:any,b:any)=>a.due_ms-b.due_ms)[0];
          if(next){
            if(next.due_ms>nowMs&&next.due_ms<=weekAheadMs){
              upcoming.push({name,email,amount:instAmt,dueDate:next.due_ms});
              totalUpcoming+=instAmt;
            } else if(next.due_ms<=nowMs){
              if(!seenOverdue.has(email)){ seenOverdue.add(email);
                const daysOverdue=Math.floor((nowMs-next.due_ms)/86_400_000);
                overdue.push({name,email,amount:instAmt,dueDate:next.due_ms,daysOverdue});
                totalOverdue+=instAmt;
              }
            }
          }
        }
      }

      // Also catch bp_em_dia=INADIMPLENTE not already caught
      for(const row of rows){
        const email=(row.email||'').toLowerCase().trim();
        if(seenOverdue.has(email)) continue;
        const emUp=(row.bp_em_dia||'').toUpperCase().trim();
        if(emUp!=='NÃO'&&emUp!=='NAO'&&emUp!=='INADIMPLENTE') continue;
        const nextMs=toEpochMs(row.bp_proximo_pagamento);
        if(nextMs<=0||nextMs>nowMs) continue;
        const name=(row.name||'—').toUpperCase();
        const instAmt=Number(row.installment_amount)||Number(row.total_amount)||0;
        const daysOverdue=Math.floor((nowMs-nextMs)/86_400_000);
        seenOverdue.add(email);
        overdue.push({name,email,amount:instAmt,dueDate:nextMs,daysOverdue});
        totalOverdue+=instAmt;
      }

      upcoming.sort((a,b)=>a.dueDate-b.dueDate);
      overdue.sort((a,b)=>b.daysOverdue-a.daysOverdue);
    } catch(e:any){console.error('[weekly] DB:',e?.message);}

    // ── Send 2 emails ──────────────────────────────────────────────────────
    const resend = new Resend(process.env.RESEND_API_KEY);
    const to     = process.env.REPORT_EMAIL||'andrecarrilho8@gmail.com';

    const [r1,r2] = await Promise.all([
      resend.emails.send({from:'RadExperts <onboarding@resend.dev>',to,subject:`📊 Tráfego · ${period}`,
        html:buildTraffic(period,campaigns,totalSpend,totalLeads,totalPurchases)}),
      resend.emails.send({from:'RadExperts <onboarding@resend.dev>',to,subject:`💰 Financeiro · ${period}`,
        html:buildFinanceiro(period,hotmartWeek,hotmartRevenue,upcoming,overdue,totalUpcoming,totalOverdue)}),
    ]);

    return NextResponse.json({ok:!r1.error&&!r2.error,trafficEmailId:r1.data?.id,financeEmailId:r2.data?.id,
      period,campaigns:campaigns.length,leadCamps:campaigns.filter(c=>c.objective==='LEADS').length,
      salesCamps:campaigns.filter(c=>c.objective==='VENDAS').length,
      upcomingCount:upcoming.length,overdueCount:overdue.length,
      errors:[r1.error,r2.error].filter(Boolean)});

  } catch(e:any){
    console.error('[weekly-report]',e.message);
    return NextResponse.json({error:e.message},{status:500});
  }
}
