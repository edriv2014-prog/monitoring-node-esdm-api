export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const gid = req.query.gid || '285923348';
    let csvUrl = process.env.SHEET_CSV_URL || '';
    if (!csvUrl) throw new Error('SHEET_CSV_URL kosong');

    // Paksa format export CSV yang benar
    if (csvUrl.includes('/d/')) {
      const m = csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (m) csvUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
    }

    const r = await fetch(csvUrl);
    if (!r.ok) throw new Error('Gagal fetch sheet: ' + r.status);
    const csv = await r.text();

    // === PARSER CSV TAHAN NEWLINE ===
    function parseCSV(text) {
      const rows = [];
      let curRow = [];
      let cur = '';
      let inQuote = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i+1];
        if (c === '"') {
          if (inQuote && next === '"') { cur += '"'; i++; } // "" = escaped "
          else inQuote =!inQuote;
        } else if (c === ',' &&!inQuote) {
          curRow.push(cur);
          cur = '';
        } else if ((c === '\n' || c === '\r') &&!inQuote) {
          if (c === '\r' && next === '\n') i++;
          curRow.push(cur);
          rows.push(curRow);
          curRow = [];
          cur = '';
        } else {
          cur += c;
        }
      }
      if (cur || curRow.length) {
        curRow.push(cur);
        rows.push(curRow);
      }
      return rows;
    }

    const allRows = parseCSV(csv).filter(row => row.join('').trim()!== '');
    if (allRows.length < 3) return res.status(200).json({ data: [], total3H: 0 });

    // Di sheet kamu: baris 0 = Tanggal, Icon, DTP | baris 1 = Backhaul, Outage, Overload, Detail Outage...
    // Data asli mulai baris 2
    const dataRows = allRows.slice(2);

    const bulan = {Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const toDay = (s) => {
      if (!s) return null;
      const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
      if (!m) return null;
      return new Date(Date.UTC(+m[3], bulan[m[2]]?? 0, +m[1])).toISOString().slice(0,10);
    };

    let lastTgl = '';
    let raw = [];

    dataRows.forEach((cols) => {
      let tgl = (cols[0] || '').replace(/^"|"$/g, '').trim() || lastTgl;
      if (tgl) lastTgl = tgl;
      if (!tgl) return;

      const detail = (cols[4] || '').trim(); // Kolom E = Detail Outage Icon
      if (!detail) return;

      // Split "1. Pos PGA... 2. Pos PGA..." -> jadi array node
      const nodes = detail.split(/\d+\.\s+/).filter(x => x.trim());

      nodes.forEach(nodeLine => {
        if (!nodeLine) return;
        const m = nodeLine.match(/^(.*?)\s+Duration\s*:/i);
        const nodeName = m? m[1].trim() : nodeLine.split('\n')[0].trim().slice(0,50);

        raw.push({
          Tanggal: tgl,
          "Node/Pos": nodeName.replace(/^\s*\d+\.\s*/, '').trim(),
          LINK: 'Icon',
          KENDALA: nodeLine.trim(),
          _day: toDay(tgl),
          _prosesKey: nodeName + '|' + tgl
        });
      });
    });

    // Hitung 3H+
    const byNode = {};
    raw.forEach(o => {
      if (!byNode[o["Node/Pos"]]) byNode[o["Node/Pos"]] = new Set();
      if (o._day) byNode[o["Node/Pos"]].add(o._day);
    });

    const is3H = (node, day) => {
      const days = [...(byNode[node] || [])].sort();
      const idx = days.indexOf(day);
      if (idx < 2) return false;
      const d1 = new Date(days[idx-2]), d2 = new Date(days[idx-1]), d3 = new Date(days[idx]);
      return (d2 - d1 === 86400000) && (d3 - d2 === 86400000);
    };

    const data = raw.map(o => ({...o, is3HPlus: is3H(o["Node/Pos"], o._day) }));
    const total3H = data.filter(d => d.is3HPlus).length;

    const potonganMap = {};
    [...data].sort((a,b) => new Date(a._day) - new Date(b._day)).forEach(o => {
      if (!potonganMap[o["Node/Pos"]]) potonganMap[o["Node/Pos"]] = o;
    });

    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      data,
      potongan: Object.values(potonganMap),
      totalPotongan: Object.keys(potonganMap).length,
      total3H,
      count3hari: Object.keys(byNode).filter(n => {
        const days = [...byNode[n]].sort();
        for(let i=2;i<days.length;i++){
          if(new Date(days[i-1]) - new Date(days[i-2]) === 86400000 && new Date(days[i]) - new Date(days[i-1]) === 86400000) return true;
        }
        return false;
      }).length,
      total: data.length
    });

  } catch (e) {
    console.error(e);
    return res.status(200).json({ data: [], error: e.message, total3H: 0, total: 0 });
  }
}