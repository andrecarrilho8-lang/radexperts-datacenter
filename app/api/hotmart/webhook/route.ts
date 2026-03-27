import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const hottok = process.env.HOTMART_HOTTOK;
  const hottokHeader = request.headers.get('x-hotmart-hottok');
  
  if (hottok && hottokHeader !== hottok) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const event = body.event; // Ex: PURCHASE_APPROVED
    const transactionId = body.data?.purchase?.transaction_id;
    const status = body.data?.purchase?.status;
    const value = body.data?.purchase?.price?.value;
    const buyerEmail = body.data?.buyer?.email;

    console.log(`[Hotmart Webhook] Evento: ${event} | Transação: ${transactionId} | Status: ${status} | Valor: BRL ${value}`);

    // Aqui podemos futuramente salvar em banco de dados ou disparar notificações
    // No momento, registramos para auditoria
    
    return NextResponse.json({ success: true, processed: transactionId });
  } catch (err: any) {
    console.error('[Hotmart Webhook] Erro ao processar:', err.message);
    return NextResponse.json({ error: 'Erro de processamento' }, { status: 500 });
  }
}
