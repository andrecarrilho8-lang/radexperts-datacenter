import { NextResponse } from 'next/server';
import { fetchHotmartSales, isOfficialProduct } from '@/app/lib/hotmartApi';

// Returns list of unique courses (products) with student count
export async function GET() {
  try {
    const now   = new Date();
    const since = new Date('2023-01-01').toISOString();
    const sales = await fetchHotmartSales(since, now.toISOString(), 60 * 24 * 60 * 60 * 1000, 8);

    const APPROVED = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);
    const courseMap = new Map<string, { id: number; name: string; students: number }>();

    sales.forEach((s: any) => {
      if (!APPROVED.has(s.purchase?.status)) return;
      const prod = s.product;
      if (!prod?.name) return;
      if (!courseMap.has(prod.name)) {
        courseMap.set(prod.name, { id: prod.id || 0, name: prod.name, students: 0 });
      }
      courseMap.get(prod.name)!.students++;
    });

    const courses = Array.from(courseMap.values())
      .sort((a, b) => b.students - a.students);

    return NextResponse.json({ courses });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
