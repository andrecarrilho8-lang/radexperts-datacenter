import 'dotenv/config';

const HOTMART_AUTH_URL = 'https://api-sec-vlc.hotmart.com/security/oauth/token';
const HOTMART_API_BASE = 'https://developers.hotmart.com/payments/api/v1';

async function getHotmartToken() {
  const clientId = process.env.HOTMART_CLIENT_ID;
  const clientSecret = process.env.HOTMART_CLIENT_SECRET;
  const basicToken = process.env.HOTMART_BASIC_TOKEN;

  if (!clientId || !clientSecret || !basicToken) throw new Error('Missing Hotmart env vars');
  
  const authHeaderValue = basicToken.startsWith('Basic ') ? basicToken : `Basic ${basicToken}`;

  const resp = await fetch(`${HOTMART_AUTH_URL}?grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeaderValue
    }
  });

  const data = await resp.json();
  return data.access_token || '';
}

async function testRange(days) {
  const token = await getHotmartToken();
  const now = new Date();
  const start = new Date();
  start.setDate(now.getDate() - days);
  
  const startMs = start.getTime();
  const endMs = now.getTime();
  
  console.log(`Testing ${days} days range (${new Date(startMs).toISOString()} to ${new Date(endMs).toISOString()})...`);
  const url = `${HOTMART_API_BASE}/sales/history?start_date=${startMs}&end_date=${endMs}&max_results=1`;
  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  
  if (!resp.ok) {
     const txt = await resp.text();
     console.error(`FAILED for ${days} days: ${resp.status} - ${txt}`);
  } else {
     const data = await resp.json();
     console.log(`SUCCESS for ${days} days! Items:`, data.items?.length || 0);
  }
}

async function run() {
  await testRange(30);
  await testRange(90);
  await testRange(365);
  await testRange(1000);
}

run();
