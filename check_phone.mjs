import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envPath = path.resolve('.env.local');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  envContent.split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length > 0) env[key.trim()] = rest.join('=').trim().replace(/^"(.*)"$/, '$1');
  });
  return env;
}
const env = loadEnv();

async function runTest() {
  const authUrl = `https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=${env.HOTMART_CLIENT_ID}&client_secret=${env.HOTMART_CLIENT_SECRET}`;
  const authHeader = env.HOTMART_BASIC_TOKEN.startsWith('Basic ') ? env.HOTMART_BASIC_TOKEN : `Basic ${env.HOTMART_BASIC_TOKEN}`;
  const tResp = await fetch(authUrl, { method: 'POST', headers: { 'Authorization': authHeader } });
  const tData = await tResp.json();
  const bearer = tData.access_token;

  console.log("Checking 10 sales for ANY phone-like field...");
  const url = `https://developers.hotmart.com/payments/api/v1/sales/history?max_results=10`;
  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${bearer}` } });
  const data = await resp.json();
  
  data.items.forEach((item, idx) => {
     console.log(`--- Sale ${idx} ---`);
     const s = JSON.stringify(item);
     const matches = s.match(/\+?\d{8,15}/g);
     if (matches) console.log("Found numbers:", matches);
     else console.log("No numbers found.");
  });
}

runTest();
