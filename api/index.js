import Papa from 'papaparse';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const SHEET_ID = '1f83CxoN-7Oqa_F7LwqejfK8bIrpW0wGJgZAkkeVgbik';
  const GID = req.query.gid || '285923348';

  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
    const r = await fetch(csvUrl);
    const text = await r.text();

    const parsed = Papa.parse(text, { header: false, skipEmptyLines: false });
    const rows = parsed.data;

    // rows[0] = header tingkat 1, rows[1] = header tingkat 2
    // rows[1][0]=Tanggal, rows[1][5]=Detail Outage Icon, rows[1][12]=Detail Outage DTP
    const data = [];

const parseChunk = (cell) => {
  if(!cell) return [];
  // Bersihkan baris kosong dobel
  const cleaned = cell.replace(/\n\s*\n/g, '\n').trim();
  return cleaned.split(/\n?(?=\d+\.\s)/g).map(c=>{
    const lines = c.trim();
    const node = lines.match(/^\d+\.\s*([^\n]+)/)?.[1]?.trim();
    // Duration bisa di baris selanjutnya, bukan satu baris
    const durMatch = lines.match(/Duration\s*:\s*([^\n]+)/i);
    const rfoMatch = lines.match(/RFO\s*:\s*([\s\S]*)/i);

    const dur = durMatch? durMatch[1].trim() : '-';
    const rfo = rfoMatch? rfoMatch[1].replace(/\n/g,' ').trim() : '-';

    if(!node) return null;
    return { node, dur, rfo };
  }).filter(Boolean);
};

    for(let i=2; i<rows.length; i++){
      const row = rows[i];
      const tgl = row[0]?.trim();
      if(!tgl) continue;

      const iconDetail = row[5] || ''; // Kolom F
      const dtpDetail = row[12] || ''; // Kolom M

      const all = [...parseChunk(iconDetail).map(x=>({...x, link:'Icon'})),...parseChunk(dtpDetail).map(x=>({...x, link:'DTP'}))];

      if(all.length===0){
        // kalau tidak ada detail, tetep bikin 1 baris biar tanggal gak hilang
        data.push({
          Tanggal: tgl,
          'Node/Pos': it.node,
          LINK: it.link,
          KENDALA: it.rfo,
          Durasi: it.dur,
          Status: 'Ready'
        });
//        data.push({ Tanggal: tgl, 'Node/Pos': '-', LINK: row[1]||'Normal', KENDALA: '-', Durasi: '-' });
      } else {
        all.forEach(it=>{
        data.push({
          Tanggal: tgl,
          'Node/Pos': it.node,
          LINK: it.link,
          KENDALA: it.rfo,
          Durasi: it.dur,
          Status: 'Ready'
        });
//          data.push({ Tanggal: tgl, 'Node/Pos': it.node, LINK: it.link, KENDALA: it.rfo, Durasi: it.dur });
        });
      }
    }

    res.json({ total: data.length, data: data.reverse() }); // terbaru di atas
  } catch(e){
    res.status(500).json({ error: e.message });
  }
}