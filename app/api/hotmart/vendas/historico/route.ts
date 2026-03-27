import { NextResponse } from 'next/server';
import { fetchHotmartSales, parseHotmartMonthly } from '@/app/lib/hotmartApi';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year') || new Date().getFullYear().toString();

  try {
    const startDate = `${year}-01-01T00:00:00`;
    const endDate = `${year}-12-31T23:59:59`;
    
    const sales = await fetchHotmartSales(startDate, endDate);
    const monthlySales = parseHotmartMonthly(sales);

    return NextResponse.json({ 
      success: true, 
      year, 
      totalSales: sales.length,
      monthly: monthlySales 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
