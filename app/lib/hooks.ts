'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDashboard } from './context';

export function useDashboardData() {
  const { dateFrom, dateTo } = useDashboard();
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [fast, setFast] = useState({
    overview: { spend: 0, revenue: 0, roas: 0, cpa: 0, purchases: 0, leads: 0, hotmartRevenue: 0, hotmartPurchases: 0 },
    tableData: [] as any[],
    spendByObjective: { VENDAS: 0, LEADS: 0, OUTROS: 0 } as Record<string, number>,
    hotmartSales: [] as any[],
    loading: true,
  });
  const [chart, setChart] = useState({
    chartData: [] as any[],
    topSalesAds: [] as any[],
    topLeadsAds: [] as any[],
    loading: true,
  });

  const fetchAll = useCallback((from: string, to: string, force: boolean = false) => {
    const qs = `dateFrom=${from}&dateTo=${to}${force ? '&force=1' : ''}`;
    setFast(p => ({ ...p, loading: true }));
    setChart(p => ({ ...p, loading: true }));
    
    fetch(`/api/meta?${qs}`)
      .then(r => r.json())
      .then(j => {
        setFast({ 
          overview: j.overview || { spend:0, revenue:0, roas:0, cpa:0, purchases:0, leads:0 }, 
          tableData: j.tableData || [], 
          spendByObjective: j.spendByObjective || { VENDAS:0, LEADS:0, OUTROS:0 }, 
          hotmartSales: j.hotmartSales || [], 
          loading: false 
        });
        setLastUpdate(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' de ' + new Date().toLocaleDateString('pt-BR'));
      })
      .catch(() => setFast(p => ({ ...p, loading: false })));
      
    fetch(`/api/meta/chart?${qs}`)
      .then(r => r.json())
      .then(j => setChart({ chartData: j.chartData || [], topSalesAds: j.topSalesAds || [], topLeadsAds: j.topLeadsAds || [], loading: false }))
      .catch(() => setChart(p => ({ ...p, loading: false })));
  }, []);

  useEffect(() => {
    fetchAll(dateFrom, dateTo);
  }, [fetchAll, dateFrom, dateTo]);

  return { 
    ...fast, 
    ...chart, 
    loading: fast.loading || chart.loading,
    fastLoading: fast.loading,
    chartLoading: chart.loading,
    lastUpdate,
    refresh: () => fetchAll(dateFrom, dateTo, true)
  };
}
