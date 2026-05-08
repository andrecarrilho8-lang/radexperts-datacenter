'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { R, D } from '@/app/lib/utils';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';

const GOLD = '#E8B14F'; const SILVER = '#A8B2C0'; const NAVY = '#001535';
const ORANGE = '#f97316';

const glass: React.CSSProperties = {
  background: 'linear-gradient(160deg,rgba(255,255,255,0.08) 0%,rgba(255,255,255,0.03) 50%,rgba(0,10,40,0.55) 100%)',
  border: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset,0 20px 40px -8px rgba(0,0,0,0.5)',
  borderRadius: 24, position: 'relative', overflow: 'hidden',
};

export default function ComissoesPage() {
  const hoje = new Date();
  const [vendedor,   setVendedor]   = useState('');
  const [dateFrom,   setDateFrom]   = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0]);
  const [dateTo,     setDateTo]     = useState(new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).toISOString().split('T')[0]);
  const [produtos,   setProdutos]   = useState<Set<string>>(new Set());
  const [prodOpen,   setProdOpen]   = useState(false);
  const [report,     setReport]     = useState<any|null>(null);
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState('');

  const [vendedorList, setVendedorList] = useState<string[]>([]);
  const [produtoList,  setProdutoList]  = useState<string[]>([]);
  const [loadingMeta,  setLoadingMeta]  = useState(true);

  const reportRef  = useRef<HTMLDivElement>(null);
  const triggerRef  = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropRect, setDropRect] = useState<{top:number;left:number;width:number}|null>(null);

  useEffect(() => {
    fetch('/api/financeiro/vendedores')
      .then(r => r.json())
      .then(j => { setVendedorList(j.vendedores || []); setProdutoList(j.produtos || []); setLoadingMeta(false); })
      .catch(() => setLoadingMeta(false));
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    if (!prodOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) setProdOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [prodOpen]);

  const openDropdown = () => {
    if (!prodOpen && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setDropRect({ top: r.bottom + 6 + window.scrollY, left: r.left + window.scrollX, width: r.width });
    }
    setProdOpen(o => !o);
  };

  const handleGerar = useCallback(async () => {
    if (!vendedor) { setError('Selecione um vendedor'); return; }
    setGenerating(true); setError(''); setReport(null);
    try {
      const res  = await fetch(`/api/financeiro/comissoes?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar');
      const vdata = (json.vendedores || []).find((v: any) => v.nome === vendedor);
      let itens: any[] = vdata?.itens || [];
      if (produtos.size > 0) itens = itens.filter((it: any) => {
        const nome = it.produto?.split(' (')[0];
        return produtos.has(nome) || produtos.has(it.produto);
      });
      setReport({ vendedor, itens, dateFrom, dateTo });
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e: any) { setError(e.message); }
    finally { setGenerating(false); }
  }, [vendedor, dateFrom, dateTo, produtos]);

  const inputStyle: React.CSSProperties = {
    width:'100%', padding:'12px 16px', borderRadius:12, fontSize:13, fontWeight:700,
    background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)',
    color:'#fff', outline:'none', cursor:'pointer', colorScheme:'dark' as any,
  };
  const selectStyle: React.CSSProperties = { ...inputStyle, appearance:'none' as any };

  const Step = ({ n, label, icon }: { n: number; label: string; icon: string }) => (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
      <div style={{ width:28, height:28, borderRadius:10, background:'rgba(232,177,79,0.15)', border:'1px solid rgba(232,177,79,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, color:GOLD, flexShrink:0 }}>{n}</div>
      <span className="material-symbols-outlined" style={{ fontSize:16, color:GOLD }}>{icon}</span>
      <p style={{ fontSize:10, fontWeight:900, letterSpacing:'0.15em', textTransform:'uppercase', color:SILVER }}>{label}</p>
    </div>
  );

  // ── Report ──────────────────────────────────────────────────────────────────
  const ReportSection = () => {
    if (!report) return null;
    const { vendedor: v, itens, dateFrom: df, dateTo: dt } = report;
    const perH   = itens.filter((i: any) => i.fonte === 'hotmart');
    const perM   = itens.filter((i: any) => i.fonte === 'manual');
    const totalH = perH.reduce((s: number, i: any) => s + i.valor, 0);
    const totalM = perM.reduce((s: number, i: any) => s + i.valor, 0);
    const total  = totalH + totalM;
    const emissao = new Date().toLocaleDateString('pt-BR');

    return (
      <div ref={reportRef} id="report-section" style={{ marginTop: 40 }}>
        {/* Actions bar */}
        <div className="no-print" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <p style={{ fontSize:11, fontWeight:700, color:SILVER }}>
            <span style={{ color:GOLD }}>✓</span> Relatório gerado — {itens.length} registro{itens.length!==1?'s':''} no período
          </p>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => { setReport(null); window.scrollTo({top:0,behavior:'smooth'}); }}
              style={{ padding:'10px 18px', borderRadius:12, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:SILVER, fontSize:11, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              <span className="material-symbols-outlined" style={{ fontSize:14 }}>arrow_upward</span>
              Voltar aos filtros
            </button>
            <button onClick={() => window.print()}
              style={{ padding:'10px 18px', borderRadius:12, border:`1px solid ${GOLD}40`, background:`${GOLD}15`, color:GOLD, fontSize:11, fontWeight:900, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              <span className="material-symbols-outlined" style={{ fontSize:14 }}>picture_as_pdf</span>
              Salvar PDF
            </button>
          </div>
        </div>

        {/* Report document (white, printable) */}
        <div id="report-doc" style={{ background:'#f8f7f2', borderRadius:20, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.6)', fontFamily:'var(--font-inter,Inter,sans-serif)', color:'#111' }}>
          {/* Header */}
          <div style={{ background:NAVY, padding:'30px 40px 26px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <p style={{ fontSize:9, fontWeight:900, letterSpacing:'0.25em', textTransform:'uppercase', color:GOLD, marginBottom:6 }}>RadExperts · Data Center</p>
              <h2 style={{ fontSize:26, fontWeight:900, color:'#fff', margin:0, letterSpacing:'-0.02em' }}>Relatório de Comissões</h2>
              <p style={{ fontSize:13, color:SILVER, marginTop:6 }}>Vendedor: <strong style={{ color:'#fff' }}>{v}</strong></p>
            </div>
            <div style={{ textAlign:'right' }}>
              <p style={{ fontSize:10, fontWeight:700, color:SILVER }}>Período</p>
              <p style={{ fontSize:14, fontWeight:900, color:'#fff' }}>{D(df)} → {D(dt)}</p>
              <p style={{ fontSize:10, fontWeight:700, color:SILVER, marginTop:8 }}>Emitido em</p>
              <p style={{ fontSize:12, fontWeight:900, color:GOLD }}>{emissao}</p>
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:1, background:'#ddd' }}>
            {[
              { label:'Total Faturado', value:R(total), color:'#b47e00', bg:'#fff8ee' },
              { label:'Total de Vendas', value:`${itens.length}`, color:NAVY, bg:'#fff' },
              { label:'Hotmart Líquido', value:R(totalH), color:'#b45309', bg:'#fff7ed' },
              { label:'Vendas Manuais', value:R(totalM), color:'#1d4ed8', bg:'#eff6ff' },
            ].map((k,i) => (
              <div key={i} style={{ background:k.bg, padding:'18px 20px' }}>
                <p style={{ fontSize:8, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.12em', color:'#999', marginBottom:4 }}>{k.label}</p>
                <p style={{ fontSize:22, fontWeight:900, color:k.color, lineHeight:1 }}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Body */}
          <div style={{ padding:'28px 40px 36px' }}>
            {/* Hotmart */}
            {perH.length > 0 && (
              <div style={{ marginBottom:28 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                  <div style={{ width:3, height:20, borderRadius:2, background:ORANGE }}/>
                  <p style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.14em', color:ORANGE }}>Hotmart · Valor Líquido ao Produtor</p>
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:'2px solid #e8e6de' }}>
                      {['#','Aluno','E-mail','Produto','Data','Valor Líq.'].map(h => (
                        <th key={h} style={{ padding:'6px 8px', textAlign:'left', fontWeight:900, fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', color:'#888' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {perH.map((it: any, i: number) => (
                      <tr key={i} style={{ borderBottom:'1px solid #edeae0', background:i%2===0?'#fff':'#faf9f5' }}>
                        <td style={{ padding:'8px', color:'#aaa', fontSize:11 }}>{i+1}</td>
                        <td style={{ padding:'8px', fontWeight:700, maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={it.nome}>{it.nome}</td>
                        <td style={{ padding:'8px', color:'#666', fontSize:11, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={it.email}>{it.email}</td>
                        <td style={{ padding:'8px', color:'#444', maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={it.produto}>{it.produto}</td>
                        <td style={{ padding:'8px', whiteSpace:'nowrap', color:'#666' }}>{it.data!=='—'?D(it.data):'—'}</td>
                        <td style={{ padding:'8px', fontWeight:900, color:'#b45309' }}>{R(it.valor)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop:'2px solid #e8e6de', background:'#fff7ed' }}>
                      <td colSpan={5} style={{ padding:'10px 8px', fontWeight:900, fontSize:10, textAlign:'right', textTransform:'uppercase', letterSpacing:'0.1em', color:'#999' }}>Subtotal Hotmart</td>
                      <td style={{ padding:'10px 8px', fontWeight:900, fontSize:16, color:'#b45309' }}>{R(totalH)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Manual */}
            {perM.length > 0 && (
              <div style={{ marginBottom:28 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                  <div style={{ width:3, height:20, borderRadius:2, background:'#2563eb' }}/>
                  <p style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.14em', color:'#2563eb' }}>Parcelas Manuais · Vencimentos no Período</p>
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:'2px solid #e8e6de' }}>
                      {['#','Aluno','E-mail','Produto / Parcela','Data Venc.','Valor'].map(h => (
                        <th key={h} style={{ padding:'6px 8px', textAlign:'left', fontWeight:900, fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', color:'#888' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {perM.map((it: any, i: number) => (
                      <tr key={i} style={{ borderBottom:'1px solid #edeae0', background:i%2===0?'#fff':'#faf9f5' }}>
                        <td style={{ padding:'8px', color:'#aaa', fontSize:11 }}>{i+1}</td>
                        <td style={{ padding:'8px', fontWeight:700, maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={it.nome}>{it.nome}</td>
                        <td style={{ padding:'8px', color:'#666', fontSize:11, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={it.email}>{it.email}</td>
                        <td style={{ padding:'8px', color:'#444', maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={it.produto}>{it.produto}</td>
                        <td style={{ padding:'8px', whiteSpace:'nowrap', color:'#666' }}>{it.data!=='—'?D(it.data):'—'}</td>
                        <td style={{ padding:'8px', fontWeight:900, color:'#1d4ed8' }}>{R(it.valor)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop:'2px solid #e8e6de', background:'#eff6ff' }}>
                      <td colSpan={5} style={{ padding:'10px 8px', fontWeight:900, fontSize:10, textAlign:'right', textTransform:'uppercase', letterSpacing:'0.1em', color:'#999' }}>Subtotal Manual</td>
                      <td style={{ padding:'10px 8px', fontWeight:900, fontSize:16, color:'#1d4ed8' }}>{R(totalM)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {itens.length === 0 && (
              <p style={{ textAlign:'center', color:'#999', padding:'40px 0', fontSize:13 }}>
                Nenhuma venda/parcela encontrada para este vendedor no período selecionado.
              </p>
            )}

            {/* Total */}
            <div style={{ background:NAVY, borderRadius:14, padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
              <p style={{ fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.15em', color:SILVER }}>
                Total Geral · {itens.length} registro{itens.length!==1?'s':''}
              </p>
              <p style={{ fontSize:30, fontWeight:900, color:GOLD, letterSpacing:'-0.02em' }}>{R(total)}</p>
            </div>

            <p style={{ fontSize:9, color:'#bbb', textAlign:'center', marginTop:20, textTransform:'uppercase', letterSpacing:'0.1em' }}>
              RadExperts Data Center · Gerado em {emissao} · Uso interno
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <LoginWrapper>
      <div style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none', background:'linear-gradient(160deg,rgba(8,8,12,0.72) 0%,rgba(18,18,24,0.65) 100%)' }}/>
      <div className="min-h-screen pb-24" style={{ position:'relative', zIndex:1 }}>
        <div className="h-[146px]"/>
        <main className="px-3 sm:px-6 max-w-[720px] mx-auto pt-4 sm:pt-10">

          {/* Header */}
          <div className="no-print" style={{ display:'flex', alignItems:'center', gap:16, marginBottom:40 }}>
            <div style={{ width:52, height:52, borderRadius:18, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(232,177,79,0.12)', border:'1px solid rgba(232,177,79,0.28)', flexShrink:0 }}>
              <span className="material-symbols-outlined" style={{ fontSize:28, color:GOLD }}>receipt_long</span>
            </div>
            <div>
              <h1 style={{ fontSize:28, fontWeight:900, color:'#fff', letterSpacing:'-0.02em', lineHeight:1.1 }}>
                Relatório de <span style={{ color:GOLD }}>Comissões</span>
              </h1>
              <p style={{ fontSize:10, fontWeight:700, letterSpacing:'0.18em', textTransform:'uppercase', color:SILVER, marginTop:4 }}>
                Selecione os filtros e gere o relatório
              </p>
            </div>
          </div>

          {/* Wizard */}
          <div className="no-print" style={{ ...glass, padding:'32px' }}>
            <div style={{ position:'absolute', inset:0, borderRadius:'inherit', pointerEvents:'none', background:'linear-gradient(180deg,rgba(255,255,255,0.05) 0%,transparent 40%)' }}/>
            <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', gap:28 }}>

              {/* Step 1 – Vendedor */}
              <div>
                <Step n={1} label="Vendedor" icon="person"/>
                <div style={{ position:'relative' }}>
                  {loadingMeta
                    ? <div style={{ ...selectStyle, color:SILVER, display:'flex', alignItems:'center', gap:8 }}>
                        <span className="material-symbols-outlined" style={{ fontSize:14, animation:'spin 1s linear infinite' }}>sync</span>
                        Carregando...
                      </div>
                    : <>
                        <select value={vendedor} onChange={e => { setVendedor(e.target.value); setError(''); }} style={{ ...selectStyle, paddingRight:36 }}>
                          <option value="" style={{ background:NAVY }}>— Selecione um vendedor —</option>
                          {vendedorList.map(v => <option key={v} value={v} style={{ background:NAVY }}>{v}</option>)}
                        </select>
                        <span className="material-symbols-outlined" style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:16, color:SILVER, pointerEvents:'none' }}>expand_more</span>
                      </>
                  }
                </div>
              </div>

              <div style={{ height:1, background:'rgba(255,255,255,0.06)' }}/>

              {/* Step 2 – Período */}
              <div>
                <Step n={2} label="Período" icon="calendar_month"/>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:10 }}>
                  <div>
                    <p style={{ fontSize:9, fontWeight:700, color:SILVER, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>De</p>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle}/>
                  </div>
                  <div>
                    <p style={{ fontSize:9, fontWeight:700, color:SILVER, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>Até</p>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle}/>
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {[
                    { label:'Este mês',   from:new Date(hoje.getFullYear(),hoje.getMonth(),1),   to:new Date(hoje.getFullYear(),hoje.getMonth()+1,0) },
                    { label:'Mês passado',from:new Date(hoje.getFullYear(),hoje.getMonth()-1,1), to:new Date(hoje.getFullYear(),hoje.getMonth(),0) },
                    { label:'30 dias',    from:new Date(hoje.getTime()-30*864e5),                to:hoje },
                    { label:'90 dias',    from:new Date(hoje.getTime()-90*864e5),                to:hoje },
                    { label:'Este ano',   from:new Date(hoje.getFullYear(),0,1),                 to:new Date(hoje.getFullYear(),11,31) },
                  ].map(p => (
                    <button key={p.label} onClick={() => { setDateFrom(p.from.toISOString().split('T')[0]); setDateTo(p.to.toISOString().split('T')[0]); }}
                      style={{ padding:'5px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:SILVER, fontSize:10, fontWeight:700, cursor:'pointer' }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ height:1, background:'rgba(255,255,255,0.06)' }}/>

              {/* Step 3 – Produtos multi-select */}
              <div>
                <Step n={3} label={`Produtos${produtos.size > 0 ? ` · ${produtos.size} selecionado${produtos.size>1?'s':''}` : ''}`} icon="school"/>
                <div style={{ position:'relative' }}>
                  <button ref={triggerRef} onClick={openDropdown}
                    style={{ ...selectStyle, textAlign:'left', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ color: produtos.size>0?'#fff':SILVER }}>
                      {produtos.size===0 ? 'Todos os produtos' : [...produtos].slice(0,2).join(', ')+(produtos.size>2?` +${produtos.size-2}`:'')}
                    </span>
                    <span className="material-symbols-outlined" style={{ fontSize:16, color:SILVER }}>{prodOpen?'expand_less':'expand_more'}</span>
                  </button>
                </div>
              </div>

              {/* Dropdown rendered via fixed position to escape overflow:hidden */}
              {prodOpen && dropRect && (
                <div ref={dropdownRef} style={{
                  position:'fixed', top:dropRect.top, left:dropRect.left, width:dropRect.width,
                  zIndex:9999, background:'#0a1628', border:'1px solid rgba(255,255,255,0.14)',
                  borderRadius:14, overflow:'hidden', boxShadow:'0 20px 50px rgba(0,0,0,0.75)',
                  maxHeight:280, overflowY:'auto',
                }}>
                  <button onClick={() => setProdutos(new Set())}
                    style={{ width:'100%', padding:'10px 16px', textAlign:'left', background:'transparent', border:'none', borderBottom:'1px solid rgba(255,255,255,0.06)', color:SILVER, fontSize:11, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:13 }}>close</span>
                    Todos os produtos (limpar)
                  </button>
                  {produtoList.map(p => {
                    const sel = produtos.has(p);
                    return (
                      <button key={p} onClick={() => { const s = new Set(produtos); sel ? s.delete(p) : s.add(p); setProdutos(s); }}
                        style={{ width:'100%', padding:'10px 16px', textAlign:'left', background:sel?'rgba(232,177,79,0.08)':'transparent', border:'none', borderBottom:'1px solid rgba(255,255,255,0.04)', color:sel?GOLD:'#fff', fontSize:12, fontWeight:sel?900:400, cursor:'pointer', display:'flex', alignItems:'center', gap:10, transition:'all 0.1s' }}>
                        <div style={{ width:16, height:16, borderRadius:5, border:`2px solid ${sel?GOLD:'rgba(255,255,255,0.2)'}`, background:sel?`${GOLD}20`:'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          {sel && <span className="material-symbols-outlined" style={{ fontSize:11, color:GOLD }}>check</span>}
                        </div>
                        {p}
                      </button>
                    );
                  })}
                </div>
              )}

              {error && (
                <div style={{ padding:'12px 16px', borderRadius:10, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', color:'#f87171', fontSize:12, fontWeight:700 }}>
                  {error}
                </div>
              )}

              {/* CTA */}
              <button onClick={handleGerar} disabled={generating || !vendedor} style={{
                padding:'16px 28px', borderRadius:14, border:'none',
                cursor: vendedor && !generating ? 'pointer' : 'not-allowed',
                background: vendedor && !generating ? `linear-gradient(135deg,${GOLD} 0%,#c9952e 100%)` : 'rgba(255,255,255,0.06)',
                color: vendedor && !generating ? NAVY : SILVER,
                fontSize:13, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.12em',
                display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                transition:'all 0.2s', opacity:generating?0.7:1,
                boxShadow: vendedor && !generating ? '0 4px 20px rgba(232,177,79,0.4)' : 'none',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize:18, animation:generating?'spin 1s linear infinite':'none' }}>
                  {generating ? 'sync' : 'receipt_long'}
                </span>
                {generating ? 'Gerando relatório…' : 'Gerar Relatório de Comissões'}
              </button>
            </div>
          </div>

          {/* Inline Report */}
          <ReportSection />

        </main>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        select option { background: ${NAVY}; color: #fff; }
        input[type=date]::-webkit-calendar-picker-indicator { filter: invert(1) opacity(0.4); }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          #report-section { margin-top: 0 !important; }
          #report-doc { box-shadow: none !important; border-radius: 0 !important; }
        }
      `}</style>
    </LoginWrapper>
  );
}
