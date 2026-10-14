export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const gid = req.query.gid || '0';
  // Link publish kamu - sudah fix
  const PUB_BASE = process.env.SHEET_CSV_URL || process.env.SHEET_CSV_URL... // baca ENV kamu
// Auto jadi: /pub?gid=285923348&single=true&output=csv
    const csvUrl = `${PUB_BASE.split('?')[0]}?gid=${gid}&single=true&output=csv`

  try {
    const resp = await fetch(csvUrl);
    const text = await resp.text();
    
    if (!resp.ok || text.includes('<!DOCTYPE') || text.length < 10) {
      return res.status(500).json({ error: `Fetch publish failed ${resp.status}`, gid, url: csvUrl, preview: text.substring(0,200) });
    }

    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length === 0) return res.json({ data: [], total: 0, gid });

    let hIdx = lines.findIndex(l => /tanggal/i.test(l));
    if (hIdx === -1) hIdx = 0;

    const splitCSV = (line) => {
      let out = [], cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        let c = line[i];
        if (c === '"') {
          if (line[i+1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
        else cur += c;
      }
      out.push(cur);
      return out.map(s => s.replace(/^"|"$/g, '').trim());
    };

    let data = [];
    for (let i = hIdx + 1; i < lines.length; i++) {
      let cols = splitCSV(lines[i]);
      if (cols.length < 2) continue;
      let tgl = (cols[0] || '').trim();
      if (!tgl || /tanggal/i.test(tgl)) continue;

      // Di sheet publish kamu: cek posisi Node
      // Biasanya: Tanggal, ..., Node, Kendala, Duration, RFO
      let nodeRaw = cols[3] || cols[4] || cols[2] || '';
      let kendalaCol = cols[4] || cols[5] || '';
      
      let full = (nodeRaw + ' ' + kendalaCol).trim();
      let parts = nodeRaw.split(/\n(?=\d+\.\s)/);
      if (parts.length === 1 && full.includes('\n')) {
        parts = full.split(/\n(?=\d+\.\s)/);
      }
      if (parts.length <= 1) parts = [full || nodeRaw];

      parts.forEach(p => {
        let clean = p.trim();
        if (!clean || clean.length < 3) return;
        let name = clean.split('\n')[0].replace(/^\d+[\.\)]\s*/, '').trim();
        name = name.split(/Duration|RFO/i)[0].trim();
        if (name.length < 2 || /duration|rfo/i.test(name)) return;

        let dur = (clean.match(/Duration\s*:\s*([^\n]+)/i)?.[1] || '').trim();
        let rfo = (clean.match(/RFO\s*:\s*([\s\S]*?)(?=\n\s*\d+\.|$)/i)?.[1] || '').trim().replace(/\n/g, ' ');

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

    return res.json({ data, total: data.length, gid, source: 'publish' });
  } catch (e) {
    return res.status(500).json({ error: e.message, gid });
  }
}
