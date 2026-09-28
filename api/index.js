import Papa from 'papaparse';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const SHEET_ID = '1f83CxoN-7Oqa_F7LwqejfK8bIrpW0wGJgZAkkeVgbik';
  const GID = req.query.gid || '285923348';

  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
    const response = await fetch(csvUrl);
    const text = await response.text();

    const parsed = Papa.parse(text, { header: false });
    const rows = parsed.data;

    const result = [];

    function extract(cell) {
      if (!cell) return [];
      const clean = cell.replace(/\n\s*\n/g, '\n');
      // pisah per nomor: "1. Pos PGA..."
      const parts = clean.split(/(?=^\d+\.|\n\d+\.)/m);
      const out = [];
      for (let part of parts) {
        part = part.trim();
        if (!part) continue;
        const nodeMatch = part.match(/^\d+\.\s*([^\n]+)/);
        const durMatch = part.match(/Duration\s*:\s*([^\n]+)/i);
        const rfoMatch = part.match(/RFO\s*:\s*([\s\S]+)/i);

        const node = nodeMatch? nodeMatch[1].trim() : null;
        if (!node) continue;

        out.push({
          node: node,
          durasi: durMatch? durMatch[1].trim() : '-',
          kendala: rfoMatch? rfoMatch[1].replace(/\n/g, ' ').trim() : '-'
        });
      }
      return out;
    }

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row ||!row[0]) continue;
      const tanggal = row[0].trim();
      if (tanggal.length < 6) continue;

      const iconDetail = row[5] || '';
      const dtpDetail = row[12] || '';

      const iconItems = extract(iconDetail);
      const dtpItems = extract(dtpDetail);

      const combined = [
       ...iconItems.map(e => ({...e, link: 'Icon' })),
       ...dtpItems.map(e => ({...e, link: 'DTP' }))
      ];

      if (combined.length === 0) continue;

      for (const item of combined) {
        result.push({
          Tanggal: tanggal,
          'Node/Pos': item.node,
          LINK: item.link,
          KENDALA: item.kendala,
          Durasi: item.durasi,
          Status: 'Ready'
        });
      }
    }

    res.json({ data: result.reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}