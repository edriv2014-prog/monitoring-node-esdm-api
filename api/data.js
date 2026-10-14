export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const gid = req.query.gid || '0';
  const PUB_BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRs7guoNrzRDNg8bP5epCOXStLlQsd9Ba8hPLweqQELJ5i0e-oEa6KRV1UYZpkvDJLOq8-XtVMn5hls';
  const SHEET_ID_REAL = '1f83CxoN-7Oqa_F7LwqejfK8bIrpW0wGJgZAkkeVgbik';

  // 2 URL - coba publish dulu, kalau 400 fallback ke export
  const urlsToTry = [
    `${PUB_BASE}/pub?gid=${gid}&single=true&output=csv&t=${Date.now()}`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID_REAL}/export?format=csv&gid=${gid}&t=${Date.now()}`
  ];

  let text = '';
  let csvUrl = '';
  let lastError = '';

  for (const u of urlsToTry) {
    try {
      csvUrl = u;
      const resp = await fetch(u);
      const t = await resp.text();
      if (resp.ok &&!t.includes('<!DOCTYPE') &&!t.includes('<html') && t.length > 10) {
        text = t;
        break;
      }
      lastError = t.substring(0, 200);
    } catch (e) {
      lastError = e.message;
    }
  }

  if (!text) {
    return res.status(500).json({ error: `Fetch publish failed 400 - coba Share Anyone Viewer`, gid, url: csvUrl, preview: lastError });
  }

  try {
    // Pakai parser robust biar cell multiline kayak "1. Pusdatin\nDuration : 14 jam" kebaca
    const parseCSV = (txt) => {
      const rows = []; let curRow = [], curCol = '', inQuote = false;
      for (let i = 0; i < txt.length; i++) {
        const c = txt[i], next = txt[i+1];
        if (c === '"') { if (inQuote && next === '"') { curCol += '"'; i++; } else inQuote =!inQuote; }
        else if (c === ',' &&!inQuote) { curRow.push(curCol); curCol = ''; }
        else if ((c === '\n' || c === '\r') &&!inQuote) {
          if (curCol || curRow.length) { curRow.push(curCol); rows.push(curRow); curRow = []; curCol = ''; }
          if (c === '\r' && next === '\n') i++;
        } else curCol += c;
      }
      if (curCol || curRow.length) { curRow.push(curCol); rows.push(curRow); }
      return rows;
    };

    const rows = parseCSV(text);
    let hIdx = rows.findIndex(r => r.some(c => /tanggal/i.test(c)));
    if (hIdx === -1) hIdx = 0;

    let data = [];
    for (let i = hIdx + 1; i < rows.length; i++) {
      let cols = rows[i];
      if (cols.length < 2) continue;
      let tgl = (cols[0] || '').trim();
      if (!tgl || /tanggal/i.test(tgl)) continue;
      if (!/Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des/i.test(tgl)) continue;

      // Di sheet kamu detail ada di col 4 (index 4) sesuai SS
      let cell = (cols[4] || cols[3] || cols[2] || '').trim();
      if (!cell) continue;

      // FIX split: cukup \n + angka, gak harus \n\n
      let parts = cell.split(/\n\s*(?=\d+\.\s)/g);
      if (parts.length <= 1) parts = [cell];

      parts.forEach(p => {
        let clean = p.trim();
        if (!clean || clean.length < 3) return;

        let lines = clean.split('\n').map(s => s.trim()).filter(Boolean);
        let firstLine = lines[0] || clean.split('\n')[0] || '';
        let name = firstLine.replace(/^\d+[\.\)]\s*/, '').trim();
        name = name.split(/Duration|RFO/i)[0].trim();
        if (name.length < 2 || /duration|rfo/i.test(name)) return;

        // FIX durasi kosong - cari di semua baris
        let dur = (clean.match(/Duration\s*:\s*([^\n]+)/i)?.[1] || '').trim();
        let rfoMatch = clean.match(/RFO\s*:\s*([\s\S]*?)(?=\n\s*\d+\.|$)/i);
        let rfo = (rfoMatch?.[1] || '').trim().replace(/\n/g, ' ');

        // Fallback kalau rfo masih kepotong
        if (!rfo) {
          const rIdx = lines.findIndex(l => /RFO\s*:/i.test(l));
          if (rIdx >= 0) rfo = lines.slice(rIdx).join(' ').replace(/RFO\s*:\s*/i, '').trim();
        }
        // Fallback durasi
        if (!dur) {
          const dLine = lines.find(l => /Duration\s*:/i.test(l));
          if (dLine) {
            const m = dLine.match(/Duration\s*:\s*(.*)/i);
            if (m) dur = m[1].trim();
          }
        }

        if (name) {
          data.push({
            Tanggal: tgl,
            "Node/Pos": name,
            Duration: dur || '-',
            RFO: rfo || '-',
            Kendala: rfo || dur || '-',
            LINK: 'Normal',
            is3HPlus: /[1-9]\d*\s*jam|[5-9]\d+\s*menit/.test(dur)
          });
        }
      });
    }

    return res.json({ data, csvUrl: csvUrl, total: data.length, gid, source: 'publish+fallback' });
  } catch (e) {
    return res.status(500).json({ error: e.message, gid, csvUrl });
  }
}
