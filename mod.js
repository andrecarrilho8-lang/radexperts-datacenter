const fs = require('fs');
const file = 'app/cursos/[courseName]/page.tsx';
let txt = fs.readFileSync(file, 'utf8');

txt = txt.replace(
  /const \[error,\s+setError\]\s+=\s+React\.useState\(''\);/,
  `const [error,    setError]    = React.useState('');
  const [useBp, setUseBp] = React.useState(false);
  const [bpVendedor, setBpVendedor] = React.useState('');
  const [bpModelo, setBpModelo] = React.useState('');
  const [bpEmDia, setBpEmDia] = React.useState('');`
);

txt = txt.replace(
  /isExisting:\s+r\.dupStatus\s+===\s+'enrich',/,
  `isExisting: r.dupStatus === 'enrich',
            vendedor:      r.vendedor?.trim()  || (useBp ? bpVendedor : null),
            bp_modelo:     r.bp_modelo?.trim() || (useBp ? bpModelo : null),
            bp_em_dia:     r.bp_em_dia?.trim() || (useBp ? bpEmDia : null),
            bp_valor:      r.bp_valor             || null,
            bp_pagamento:  r.bp_pagamento         || null,
            bp_parcela:    r.bp_parcela           || null,
            bp_primeira_parcela:  r.bp_primeira_parcela  ? new Date(r.bp_primeira_parcela).getTime()  : null,
            bp_ultimo_pagamento:  r.bp_ultimo_pagamento  ? new Date(r.bp_ultimo_pagamento).getTime()  : null,
            bp_proximo_pagamento: r.bp_proximo_pagamento ? new Date(r.bp_proximo_pagamento).getTime() : null,`
);

txt = txt.replace(
  /<\/div>\s*<div style=\{\{\s*display:\s*'flex',\s*gap:\s*10\s*\}\}>/g,
  function(match, offset) {
      if (offset < 1600 || offset > 1750) return match; 
      return `</div>

          <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 900, color: '#a8b2c0', textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}>
              <input type="checkbox" checked={useBp} onChange={e => setUseBp(e.target.checked)} />
              Incluir mesmos dados adicionais para TODOS os alunos identificados
            </label>
            {useBp && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 12 }}>
                 <div>
                  <label style={{ display: 'block', fontSize: 10, color: '#a8b2c0', marginBottom: 4 }}>Vendedor</label>
                  <input style={IN} placeholder="Ex: Samuel" value={bpVendedor} onChange={e => setBpVendedor(e.target.value)} />
                 </div>
                 <div>
                  <label style={{ display: 'block', fontSize: 10, color: '#a8b2c0', marginBottom: 4 }}>Modelo</label>
                  <input style={IN} placeholder="1x / Recorrência" value={bpModelo} onChange={e => setBpModelo(e.target.value)} />
                 </div>
                 <div>
                  <label style={{ display: 'block', fontSize: 10, color: '#a8b2c0', marginBottom: 4 }}>Status</label>
                  <input style={IN} placeholder="SIM / QUITO" value={bpEmDia} onChange={e => setBpEmDia(e.target.value)} />
                 </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>`;
  }
);

txt = txt.replace(
  /notes:\s+'',\s*\n\s*\}\);/,
  `notes:               '',
    bp_vendedor:         '',
    bp_modelo:           '',
    bp_em_dia:           '',
  });`
);

txt = txt.replace(
  /notes:\s+form\.notes,\s*\n\s*};\s*\n\s*const r = await fetch\('\/api\/alunos\/manual'/,
  `notes: form.notes,
        bp_vendedor: form.bp_vendedor,
        bp_modelo: form.bp_modelo,
        bp_em_dia: form.bp_em_dia,
        bp_valor: form.total_amount,
        bp_pagamento: form.payment_type === 'PIX' ? 'Pix' : 'Cartao',
      };
      const r = await fetch('/api/alunos/manual'`
);

txt = txt.replace(
  /\{\/\*\s*Notes\s*\*\/\}\s*\n\s*<div style=\{\{\s*marginBottom:\s*24\s*\}\}>/,
  `{/* Row Additional Buyer Profiles fields */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '20px 0' }} />
          <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(168,178,192,0.8)', marginBottom: 12 }}>
            Informações Adicionais (Planilha)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={LABEL}>Vendedor</label>
              <input style={INPUT} placeholder="Samuel" value={form.bp_vendedor}
                onChange={e => setForm(f => ({ ...f, bp_vendedor: e.target.value }))} />
            </div>
            <div>
              <label style={LABEL}>Modelo</label>
              <input style={INPUT} placeholder="1x / Recorrência" value={form.bp_modelo}
                onChange={e => setForm(f => ({ ...f, bp_modelo: e.target.value }))} />
            </div>
            <div>
              <label style={LABEL}>Status</label>
              <input style={INPUT} placeholder="SIM / QUITO" value={form.bp_em_dia}
                onChange={e => setForm(f => ({ ...f, bp_em_dia: e.target.value }))} />
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 24 }}>`
);

fs.writeFileSync(file, txt);
console.log("Replaced successfully!");
