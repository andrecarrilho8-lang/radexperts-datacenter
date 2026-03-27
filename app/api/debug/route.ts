import { NextResponse } from 'next/server';

export async function GET() {
  const token   = process.env.META_ACCESS_TOKEN || '';
  const account = process.env.META_AD_ACCOUNT_ID || '';

  const diagnostics: Record<string, any> = {
    tokenPresent:   token.length > 0,
    tokenLength:    token.length,
    tokenStart:     token.substring(0, 8) + '...',
    accountPresent: account.length > 0,
    accountValue:   account,
  };

  // Test 1: token identity
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${token}`);
    const d = await r.json();
    diagnostics.tokenTest = d.error ? `ERRO: ${d.error.message}` : `OK: ${d.name} (${d.id})`;
  } catch (e: any) {
    diagnostics.tokenTest = `EXCEPTION: ${e.message}`;
  }

  // Test 2: account access
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${account}?fields=name,account_status&access_token=${token}`);
    const d = await r.json();
    diagnostics.accountTest = d.error ? `ERRO: ${d.error.message}` : `OK: ${d.name} status=${d.account_status}`;
  } catch (e: any) {
    diagnostics.accountTest = `EXCEPTION: ${e.message}`;
  }

  // Test 3: insights with URLSearchParams
  try {
    const p = new URLSearchParams({
      fields: 'spend,impressions',
      level: 'account',
      date_preset: 'last_7d',
      access_token: token,
    });
    const r = await fetch(`https://graph.facebook.com/v19.0/${account}/insights?${p}`);
    const d = await r.json();
    diagnostics.insightsTest = d.error
      ? `ERRO: ${d.error.message} (code ${d.error.code})`
      : `OK: spend=${d.data?.[0]?.spend} impressions=${d.data?.[0]?.impressions}`;
  } catch (e: any) {
    diagnostics.insightsTest = `EXCEPTION: ${e.message}`;
  }

  return NextResponse.json(diagnostics);
}
