import https from 'https';

// Cache por chave "CURRENCY_YYYY-MM-DD"
const RATE_CACHE: Record<string, number> = { 'BRL': 1 };

const FALLBACKS: Record<string, number> = {
  'USD': 5.0, 'EUR': 5.4, 'MXN': 0.30, 'ARS': 0.005, 'COP': 0.0013,
  'CLP': 0.0055, 'PEN': 1.35, 'UYU': 0.13, 'BOB': 0.72, 'CRC': 0.0098, 'HNL': 0.20
};

function httpsGetText(url: string): Promise<string> {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c: string) => data += c);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve('{}'));
  });
}

/**
 * Busca a cotação de uma moeda para uma data específica (YYYY-MM-DD).
 * Usa AwesomeAPI daily endpoint. Faz cache por moeda+data.
 */
async function getRateForDate(currency: string, date: string): Promise<number> {
  const c = currency.toUpperCase();
  if (c === 'BRL') return 1;

  const cacheKey = `${c}_${date}`;
  if (RATE_CACHE[cacheKey] !== undefined) return RATE_CACHE[cacheKey];

  // AwesomeAPI: /json/daily/USD-BRL/1?start_date=20260301&end_date=20260301
  // Normalize date: YYYY-MM-DD → YYYYMMDD
  const dateStr = date.replace(/-/g, '');
  const url = `https://economia.awesomeapi.com.br/json/daily/${c}-BRL/1?start_date=${dateStr}&end_date=${dateStr}`;

  try {
    const body = await httpsGetText(url);
    const json = JSON.parse(body);
    if (Array.isArray(json) && json.length > 0) {
      const rate = parseFloat(json[0].bid);
      if (!isNaN(rate) && rate > 0) {
        RATE_CACHE[cacheKey] = rate;
        return rate;
      }
    }
  } catch { /* fallthrough */ }

  // Segunda tentativa: cotação atual (endpoint /last)
  const urlLast = `https://economia.awesomeapi.com.br/json/last/${c}-BRL`;
  try {
    const body = await httpsGetText(urlLast);
    const json = JSON.parse(body);
    const key = `${c}BRL`;
    if (json[key]) {
      const rate = parseFloat(json[key].bid);
      RATE_CACHE[cacheKey] = rate;
      RATE_CACHE[c] = rate; // Salva como cotação corrente também
      return rate;
    }
  } catch { /* fallthrough */ }

  // Fallback hardcoded
  const fb = FALLBACKS[c] || 1;
  RATE_CACHE[cacheKey] = fb;
  return fb;
}

/**
 * Converte um valor para BRL com base na cotação do dia da venda.
 * date: string ISO ou YYYY-MM-DD
 */
export async function convertToBRLOnDate(value: number, currency: string, dateIso: string): Promise<number> {
  if (!currency || currency.toUpperCase() === 'BRL') return value;
  const dateOnly = dateIso ? dateIso.split('T')[0] : new Date().toISOString().split('T')[0];
  const rate = await getRateForDate(currency, dateOnly);
  return value * rate;
}

/**
 * Busca cotações em lote (para a data de hoje) — usado para somar totais globais.
 */
export async function getAllRates(currencies: string[]): Promise<Record<string, number>> {
  const today = new Date().toISOString().split('T')[0];
  const unique = Array.from(new Set(currencies)).map(c => c.toUpperCase()).filter(c => c !== 'BRL');
  await Promise.all(unique.map(c => getRateForDate(c, today)));
  return RATE_CACHE;
}

export function getConvertedValue(value: number, currency: string): number {
  const c = (currency || 'BRL').toUpperCase();
  if (c === 'BRL') return value;
  // Tenta cotação mais recente disponível no cache
  const today = new Date().toISOString().split('T')[0];
  const todayKey = `${c}_${today}`;
  const rate = RATE_CACHE[todayKey] || RATE_CACHE[c] || FALLBACKS[c] || 1;
  return value * rate;
}
