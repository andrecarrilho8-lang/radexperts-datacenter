import https from 'https';

const CACHE_RATES: Record<string, number> = { 'BRL': 1 };

export async function getAllRates(currencies: string[]): Promise<Record<string, number>> {
  const unique = Array.from(new Set(currencies)).map(c => c.toUpperCase()).filter(c => c !== 'BRL');
  if (unique.length === 0) return CACHE_RATES;

  const pairs = unique.map(c => `${c}-BRL`).join(',');
  const url = `https://economia.awesomeapi.com.br/json/last/${pairs}`;

  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          unique.forEach(c => {
            const key = `${c}BRL`;
            if (json[key]) CACHE_RATES[c] = parseFloat(json[key].bid);
          });
        } catch (e) { console.error('Currency API Parse Error:', e); }
        
        // Fallbacks para moedas que a API pode não ter no endpoint /last
        const fallbacks: Record<string, number> = {
          'USD': 5.0, 'EUR': 5.4, 'MXN': 0.30, 'ARS': 0.005, 'COP': 0.0013, 
          'CLP': 0.0055, 'PEN': 1.35, 'UYU': 0.13, 'BOB': 0.72, 'CRC': 0.0098, 'HNL': 0.20
        };
        unique.forEach(c => {
          if (!CACHE_RATES[c]) CACHE_RATES[c] = fallbacks[c] || 1;
        });
        resolve(CACHE_RATES);
      });
    }).on('error', () => {
      resolve(CACHE_RATES);
    });
  });
}

export function getConvertedValue(value: number, currency: string) {
  const c = (currency || 'BRL').toUpperCase();
  const rate = CACHE_RATES[c] || 1;
  return value * rate;
}
