// Calls the live API to import students from the spreadsheet
// No need for direct DB access
import * as XLSX from 'xlsx';
import https from 'https';

const BASE_URL = 'https://datacenter.radexperts.com.br';
const COURSE_NAME = 'Educação Continuada - Neuroexpert';

function parseAmt(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  const nums = String(v).replace(/\./g,'').replace(',','.').match(/[\d]+(?:\.[\d]+)?/g);
  return nums ? parseFloat(nums[nums.length - 1]) : 0;
}
function excelToISO(serial) {
  if (!serial || typeof serial !== 'number') return '';
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return d.toISOString().slice(0, 10);
}

// Parse spredsheet
const wb = XLSX.readFile('Educacao continuada (1).xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
const h = rows[0];
const I = (col) => h.indexOf(col);

const students = [];
for (const row of rows.slice(1)) {
  const name  = (row[I('Nome')] || '').toString().trim();
  const rawEmail = (row[I('Email')] || '').toString().trim();
  const email = rawEmail.split(/[/,\s]/)[0].toLowerCase().trim();
  if (!email || !name) { console.log('Sem email:', name); continue; }

  const phone    = (row[I('Telefone')] || '').toString().trim().replace(/[\r\n\t]/g,'').trim();
  const cpf      = (row[I('CPF')] || '').toString().trim();
  const vendedor = (row[I('Vendedor')] || '').toString().trim();
  const pagamento= (row[I('Pagamento')] || '').toString().trim();
  const modelo   = (row[I('Modelo')] || '').toString().trim();
  const parcela  = parseAmt(row[I('Parcela')]);
  const emDia    = (row[I('EM DIA')] || '').toString().trim() || '';
  const proxISO  = excelToISO(row[I('Próximo Pagamento')]);
  const ultiISO  = excelToISO(row[I('Último Pagamento')]);
  const primISO  = excelToISO(row[I('Primeira Parcela')]);
  const entryISO = primISO || new Date().toISOString().slice(0, 10);

  students.push({
    name: name.toUpperCase(),
    email,
    phone,
    cpf: cpf !== '?' ? cpf : '',
    paymentMethod: pagamento.toLowerCase().includes('cartão') ? 'CREDIT_CARD' : 'PIX',
    totalAmount: String(parcela),
    installments: '1',
    installmentAmount: String(parcela),
    installmentsPaid: '',
    entryDate: entryISO,
    vendedor,
    bp_valor: String(parcela),
    bp_pagamento: pagamento,
    bp_modelo: modelo,
    bp_parcela: String(parcela),
    bp_primeira_parcela: primISO,
    bp_ultimo_pagamento: ultiISO,
    bp_proximo_pagamento: proxISO,
    bp_em_dia: emDia === 'QUITADO' ? 'QUITADO' : emDia === 'SIM' ? 'SIM' : emDia || '',
  });
}

console.log(`Parsed ${students.length} students from spreadsheet`);

// Step 1: Delete backfill via a DELETE request 
// (We'll handle this via the API's internal logic — use batch with force overwrite)
// Actually let's call a simple DELETE via fetch
async function apiFetch(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(BASE_URL + path);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'x-admin-key': 'radexperts2024',
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Step 2: Import via batch API
console.log('\nImporting via batch API...');
const result = await apiFetch(
  `/api/alunos/batch?course=${encodeURIComponent(COURSE_NAME)}`,
  'POST',
  { students, courseName: COURSE_NAME }
);
console.log('Status:', result.status);
console.log('Response:', JSON.stringify(result.data).slice(0, 500));
