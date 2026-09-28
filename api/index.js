import cors from 'cors';
import express from 'express';

const app = express();
app.use(cors());

function parseDetailOutage(cell) {
  if (!cell) return [];
  // Pisah "1. Pusdatin\nDuration : 14 jam\nRFO :..." jadi 2 item
  return cell.split(/\n(?=\d+\.\s)/g).map(chunk => {
    const node = chunk.match(/^\d+\.\s*([^\n]+)/)?.[1]?.trim() || '-';
    const durasi = chunk.match(/Duration\s*:\s*([^\n]+)/i)?.[1]?.trim() || '-';
    const rfo = chunk.match(/RFO\s*:\s*([\s\S]*)/i)?.[1]?.replace(/\n/g,' ').trim() || '-';
    return { node, durasi, rfo };
  }).filter(x=>x.node!=='-');
}

app.get('/api/data', async (req, res) => {
  try {
    const SHEET_ID = '1f83CxoN-7Oqa_F7LwqejfK8bIrpW0wGJgZAkkeVgbik';
    const GID = req.query.gid || '285923348';

    // PAKAI CSV BIAR HEADER BARIS 2 KEBACA BENER
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
    const r = await fetch(url);
    const csvText = await r.text();

    const lines = csvText.split('\n');
    // baris 0 = Tanggal | Icon | DTP
    // baris 1 = Backhaul | Normal | Outage | Overload | Detail Outage | Status...
    const header2 = lines[1].split(',').map(h=>h.replace(/"/g,'').trim());

    const data = [];
    for (let i=2; i<lines.length; i++) {
      // pakai regex split CSV sederhana
      const cols = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
      if (!cols.length) continue;
      const clean = cols.map(c=>c.replace(/^"|"$/g,'').trim());

      const tanggal = clean[0];
      if (!tanggal ||!tanggal.includes('2026')) continue;

      const iconDetail = clean[5] || ''; // Kolom F = Icon Detail Outage
      const dtpDetail = clean[12] || ''; // Kolom M = DTP Detail Outage

      const iconItems = parseDetailOutage(iconDetail);
      const dtpItems = parseDetailOutage(dtpDetail);

      [...iconItems.map(x=>({...x, link:'Icon'})),...dtpItems.map(x=>({...x, link:'DTP'}))].forEach(item=>{
        data.push({
          Tanggal: tanggal,
          'Node/Pos': item.node,
          LINK: item.link,
          KENDALA: item.rfo,
          Durasi: item.durasi,
          Status: clean[7] || 'Ready'
        });
      });
    }

    res.json({ data });
  } catch(e){
    res.status(500).json({ error: e.message });
  }
});

export default app;