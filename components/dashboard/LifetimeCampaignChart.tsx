'use client';
import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { R, N, D } from '@/app/lib/utils';

export function LifetimeCampaignChart({ campaignId, type }: { campaignId: string; type: 'VENDAS' | 'LEADS' }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startScrollLeft = useRef(0);

  const resultKey = type === 'VENDAS' ? 'purchases' : 'leads';
  const PX_PER_DAY = 10;
  const TOTAL_HEIGHT = 330;

  useEffect(() => {
    fetch(`/api/meta/campaign/${campaignId}/chart`)
      .then(r => r.json())
      .then(d => { setData(d.chartData || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [campaignId]);

  // Auto-scroll to right (most recent day)
  useEffect(() => {
    if (data.length > 0 && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [data]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = true;
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    startScrollLeft.current = scrollRef.current.scrollLeft;
    scrollRef.current.style.cursor = 'grabbing';
    e.preventDefault();
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    scrollRef.current.scrollLeft = startScrollLeft.current - (e.pageX - scrollRef.current.offsetLeft - startX.current);
  };
  const onMouseUp = () => {
    isDragging.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = 'grab';
  };

  const header = (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h3 className="font-headline font-bold text-2xl text-white flex items-center gap-3">
        <span className="material-symbols-outlined text-[28px]" style={{ color: '#E8B14F' }}>analytics</span>
        Performance Vitalícia
        <span className="text-xs font-normal" style={{ color: '#A8B2C0' }}>{data.length} dias · Investimento vs {type === 'VENDAS' ? 'Vendas' : 'Leads'}</span>
      </h3>
      <div className="flex items-center gap-5 text-[11px] font-bold">
        <span className="flex items-center gap-1.5" style={{ color: '#818cf8' }}><span className="w-3 h-3 rounded-full bg-indigo-400 inline-block" />&nbsp;Investimento</span>
        <span className="flex items-center gap-1.5" style={{ color: '#34d399' }}><span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />&nbsp;{type === 'VENDAS' ? 'Vendas' : 'Leads'}</span>
      </div>
    </div>
  );

  if (loading) return (
    <div className="rounded-3xl p-8 mb-12" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {header}
      <div className="h-[330px] w-full rounded-2xl animate-pulse flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <span className="material-symbols-outlined text-[80px]" style={{ color: 'rgba(255,255,255,0.1)' }}>show_chart</span>
      </div>
    </div>
  );

  if (data.length === 0) return (
    <div className="rounded-3xl p-8 mb-12" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {header}
      <div className="h-[200px] flex items-center justify-center" style={{ color: '#A8B2C0' }}>
        <span className="text-sm font-bold">Sem dados disponíveis</span>
      </div>
    </div>
  );

  return (
    <div className="rounded-3xl p-8 mb-12" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {header}

      <p className="text-[10px] font-bold mb-3 flex items-center gap-1 select-none" style={{ color: '#A8B2C0' }}>
        <span className="material-symbols-outlined text-[14px]">drag_pan</span>
        Arraste para navegar
      </p>

      {/*
        Trick: minWidth = days * PX_PER_DAY ensures dates have room.
        When that's less than the parent width, ResponsiveContainer stretches to 100%.
        When it's more, the scrollDiv scrolls horizontally.
      */}
      <div
        ref={scrollRef}
        style={{ overflowX: 'auto', overflowY: 'hidden', cursor: 'grab', scrollbarWidth: 'none' } as React.CSSProperties}
        className="select-none w-full"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div style={{ minWidth: data.length * PX_PER_DAY, height: TOTAL_HEIGHT }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 50 }}>
              <defs>
                <linearGradient id="cgSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cgRes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                tickFormatter={D}
                tick={{ fontSize: 9, fontWeight: 700, fill: '#A8B2C0', textAnchor: 'end' }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-60}
                dy={4}
              />
              <YAxis yAxisId="left" tickFormatter={val => 'R$' + val} tick={{ fontSize: 9, fontWeight: 700, fill: '#818cf8' }} axisLine={false} tickLine={false} width={65} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fontWeight: 700, fill: '#34d399' }} axisLine={false} tickLine={false} width={35} />
              <Tooltip
                contentStyle={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,26,53,0.97)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', padding: '12px 16px', fontSize: 12, color: '#fff' }}
                labelFormatter={D as any}
                formatter={((value: any, name: any) => [
                  name === 'spend' ? R(value) : N(value),
                  name === 'spend' ? 'Investimento' : type === 'VENDAS' ? 'Vendas' : 'Leads'
                ]) as any}
              />
              <Area yAxisId="left" type="monotone" dataKey="spend" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#cgSpend)" dot={false} animationDuration={1200} />
              <Area yAxisId="right" type="monotone" dataKey={resultKey} stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#cgRes)" dot={false} animationDuration={1600} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
