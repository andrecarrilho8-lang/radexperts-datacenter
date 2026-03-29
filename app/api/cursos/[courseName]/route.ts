import { NextRequest, NextResponse } from 'next/server';
import { fetchHotmartSales, getHotmartToken } from '@/app/lib/hotmartApi';
import https from 'https';

const APPROVED = new Set(['APPROVED', 'COMPLETE', 'PRODUCER_CONFIRMED', 'CONFIRMED']);

function httpsGet(token: string, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'developers.hotmart.com', path, method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } },
      (res) => { let d = ''; res.on('data', c => { d += c; }); res.on('end', () => resolve({ status: res.statusCode || 0, body: d })); }
    );
    req.on('error', reject);
    req.end();
  });
}

function paymentLabel(method: string): string {
  const m = (method || '').toUpperCase();
  if (m.includes('PIX'))                         return 'Pix';
  if (m.includes('CREDIT') || m.includes('CARD')) return 'Cartão Crédito';
  if (m.includes('DEBIT'))                       return 'Cartão Débito';
  if (m.includes('BOLETO') || m.includes('BILLET')) return 'Boleto';
  if (m.includes('PAYPAL'))                      return 'PayPal';
  if (m.includes('SUBSCRIPTION'))               return 'Assinatura';
  return method || '—';
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const courseId   = searchParams.get('courseId');   // product id (number)
  const courseName = searchParams.get('courseName'); // product name
  const turma      = searchParams.get('turma') || '';

  if (!courseName && !courseId) {
    return NextResponse.json({ error: 'courseId or courseName required' }, { status: 400 });
  }

  try {
    const since = new Date('2023-01-01').toISOString();
    const now   = new Date().toISOString();
    const sales = await fetchHotmartSales(since, now, 60 * 24 * 60 * 60 * 1000, 8);

    // Attempt to get last access from Club API if subdomain configured
    const subdomain = process.env.HOTMART_CLUB_SUBDOMAIN || '';
    const lastAccessMap = new Map<string, string>(); // email → last access ISO

    if (subdomain) {
      try {
        const token = await getHotmartToken();
        let pageToken = '';
        do {
          const path = `/club/api/v1/users?subdomain=${subdomain}${pageToken ? `&page_token=${pageToken}` : ''}`;
          const resp = await httpsGet(token, path);
          if (resp.status !== 200) break;
          const data = JSON.parse(resp.body);
          (data.items || []).forEach((u: any) => {
            if (u.user_login && u.last_access) {
              lastAccessMap.set(u.user_login.toLowerCase(), u.last_access);
            }
          });
          pageToken = data.page_info?.next_page_token || '';
        } while (pageToken);
      } catch { /* Club API optional */ }
    }

    // Filter by product
    const filtered = sales.filter((s: any) => {
      if (!APPROVED.has(s.purchase?.status)) return false;
      const prod = s.product || {};
      if (courseId && String(prod.id) !== String(courseId)) return false;
      if (courseName && !courseId && prod.name !== courseName) return false;
      return true;
    });

    // Deduplicate by email (keep most recent purchase)
    const studentMap = new Map<string, any>();
    filtered.forEach((s: any) => {
      const email = (s.buyer?.email || '').toLowerCase();
      if (!email) return;
      const existing = studentMap.get(email);
      const ts = s.purchase?.approved_date || s.purchase?.order_date || 0;
      if (!existing || ts > (existing._ts || 0)) {
        studentMap.set(email, { ...s, _ts: ts });
      }
    });

    // Collect unique turmas  
    const turmasSet = new Set<string>();
    filtered.forEach((s: any) => {
      const t = s.purchase?.offer?.code || s.purchase?.offer?.name || '';
      if (t) turmasSet.add(t);
    });

    // Build student list
    let students = Array.from(studentMap.values()).map((s: any) => {
      const purchase = s.purchase || {};
      const buyer    = s.buyer    || {};
      const email    = (buyer.email || '').toLowerCase();
      const turmaVal = purchase?.offer?.code || purchase?.offer?.name || '—';
      const payType  = purchase?.payment?.type || '';
      const payInstall = purchase?.payment?.installments_number || 1;
      const offerMode  = purchase?.offer?.payment_mode || '';

      let payLabel = paymentLabel(payType);
      if (offerMode === 'SUBSCRIPTION') payLabel = 'Assinatura';
      else if (payInstall > 1) payLabel = `Cartão ${payInstall}x`;

      return {
        email,
        name:        buyer.name || '—',
        phone:       buyer.phone || '—',
        entryDate:   purchase.approved_date || purchase.order_date || null,
        lastAccess:  lastAccessMap.get(email) || null,
        payment:     payLabel,
        turma:       turmaVal,
        transaction: purchase.transaction || '',
      };
    });

    // Filter by turma if provided
    if (turma) {
      students = students.filter(st => st.turma === turma);
    }

    // Sort by entry date desc
    students.sort((a, b) => (b.entryDate || 0) - (a.entryDate || 0));

    return NextResponse.json({
      students,
      turmas: Array.from(turmasSet).sort(),
      total: students.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
