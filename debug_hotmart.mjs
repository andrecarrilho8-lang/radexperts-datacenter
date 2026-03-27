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
  const token = "H4sIAAAAAAAAAA3M25ZrMAAA0C9yltIwHluTtnGJUaLixSoykWhV3YqvP%2FO%2B12arUxfnUgTCiciGdligAbVXUNrIQE2XJrZj%2FWOr82CXgwgk1PEWan5MVLyRAT079R79QXkUVBKNxlfpxQctiPmIz%2BGeChX4EqpeXDc0pjss4Yo1LLPoL22ccXzCTemU92CcXzja%2Bt8L0VW%2BaISQjxHODes%2FkHVTilNM7re78AwoIvMXeIbatnIvdyl%2BnzrFGhNxjPPpQUPdLN5RnvQDFV%2Fe2jjmy30DPZr8x%2BVg658wtY8Tkt0ckNNE9ckjcG16YS17%2BUPSime2QGW3jyDl%2Fon3A3H5t7ghu1DHvoyrojbGuXy6Ww8CJQ5nJDKad6vB44%2FpNxLVYCvqpf0ar4n6ujcBwERjRyvJgTgrXCodZmYW1IOzWaOxHRzkRu6NNTLiRe562cLK9XUuvHrB7FZBumOAL%2FUIWwmsq8nUE5byW5mrFloOr%2FPpbuWXgb5noFTJTzY7S%2FHi%2FwEjHqyA0AEAAA%3D%3D";
  const now = new Date();
  const start = new Date();
  start.setDate(now.getDate() - 30);
  
  const url = `https://developers.hotmart.com/payments/api/v1/sales/history?start_date=${start.getTime()}&end_date=${now.getTime()}&max_results=5`;
  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  const data = await resp.json();
  
  if (data.items && data.items.length > 0) {
     console.log("ITEM KEYS:", Object.keys(data.items[0]));
     console.log("PURCHASE:", JSON.stringify(data.items[0].purchase, null, 2));
     console.log("BUYER:", JSON.stringify(data.items[0].buyer, null, 2));
  } else {
     console.log("NO SALES FOUND IN 30 DAYS.");
  }
}

runTest();
