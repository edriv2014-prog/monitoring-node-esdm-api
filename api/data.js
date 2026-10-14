export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const menu = req.query.menu; // 0 = icon, 1 = dtp
  const gid = menu == 1? '285923348' : '0';

  const ENV_PUB = process.env.SHEET_CSV_URL;
  const PUB_BASE = ENV_PUB.split('/pub')[0] + '/pub';
  const SHEET_ID_REAL = '1f83CxoN-7Oqa_F7LwqejfK8bIrpW0wGJgZAkkeVgbik';

  const urls = [
    `${PUB_BASE}?gid=${gid}&single=true&output=csv&t=${Date.now()}`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID_REAL}/export?format=csv&gid=${gid}&t=${Date.now()}`
  ];

  let text = '';
  for (const u of urls) {
    const r = await fetch(u); const t = await r.text();
    if (r.ok &&!t.includes('<!DOCTYPE')) { text = t; break; }
  }
  if (!text) return res.status(500).json({ error: 'Fetch failed', gid, menu });

  const splitCSV = (line) => {
    let out=[],cur='',inQ=false;
    for(let i=0;i<line.length;i++){
      let c=line[i];
      if(c=='"'){ if(line[i+1]=='"'){cur+='"';i++;} else inQ=!inQ; }
      else if(c==','&&!inQ){out.push(cur);cur='';}
      else cur+=c;
    }
    out.push(cur);
    return out.map(s=>s.replace(/^"|"$/g,'').trim());
  };

  const parseCSV = (txt) => {
    const rows=[]; let curRow=[], curCol='', inQ=false;
    for(let i=0;i<txt.length;i++){
      const c=txt[i], n=txt[i+1];
      if(c=='"'){ if(inQ&&n=='"'){curCol+='"';i++;} else inQ=!inQ; }
      else if(c==','&&!inQ){curRow.push(curCol);curCol='';}
      else if((c=='\n'||c=='\r')&&!inQ){
        if(curCol||curRow.length){curRow.push(curCol);rows.push(curRow);curRow=[];curCol='';}
        if(c=='\r'&&n=='\n') i++;
      }else curCol+=c;
    }
    if(curCol||curRow.length){curRow.push(curCol);rows.push(curRow);}
    return rows;
  };

  const rows = parseCSV(text);
  let hIdx = rows.findIndex(r=>r.some(c=>/backhaul|tanggal/i.test(c))); if(hIdx===-1) hIdx=0;

  let data=[];
  for(let i=hIdx+1;i<rows.length;i++){
    let cols=rows[i]; if(cols.length<3) continue;
    let tgl=(cols[0]||'').trim(); if(!tgl||/backhaul/i.test(tgl)) continue;
    if(!/Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des/i.test(tgl)) continue;

    // === FIX YANG KAMU MAU: CARI DETAIL OUTAGE YANG TIDAK NULL ===
    let detailCell = cols.find(c=>/Duration\s*:/i.test(c)) || '';

    // Kalau gak ketemu Duration, coba ambil col sesuai menu (Icon=col 3, DTP=col 4)
    if(!detailCell){
      detailCell = menu==1? (cols[4]||'') : (cols[3]||'');
    }

    // FILTER: Detail Outage NULL / KOSONG / "-" SKIP!
    if(!detailCell) continue;
    let cek = detailCell.trim().toLowerCase();
    if(cek===''||cek==='-'||cek==='null'||cek==='undefined') continue;
    if(!/duration|RFO/i.test(detailCell)) continue; // harus ada Duration/RFO

    let parts=detailCell.split(/\n\s*(?=\d+\.\s)/g); if(parts.length<=1) parts=[detailCell];

    parts.forEach(p=>{
      let clean=p.trim(); if(!clean||clean.length<3) continue;
      if(clean.toLowerCase()==='null'||clean==='-'||clean==='') return;

      let lines=clean.split('\n').map(s=>s.trim()).filter(Boolean);
      let name=(lines[0]||'').replace(/^\d+[\.\)]\s*/,'').trim().split(/Duration|RFO/i)[0].trim();
      if(!name||name.length<2||/duration|rfo/i.test(name)) return;

      let dur=(clean.match(/Duration\s*:\s*([^\n]+)/i)?.[1]||'').trim();
      let rfo=(clean.match(/RFO\s*:\s*([\s\S]*?)(?=\n\s*\d+\.|$)/i)?.[1]||'').trim().replace(/\n/g,' ');

      // FILTER KENDALA NULL - jangan masukin kalau kendala kosong
      if(!dur||dur==='-'||dur.toLowerCase()==='null') return;

      data.push({
        Tanggal:tgl,
        "Node/Pos":name,
        Duration:dur,
        RFO:rfo||dur,
        Kendala:`Duration : ${dur} RFO : ${rfo}`, // Kendala pasti ada
        LINK:'Normal',
        is3HPlus:/[1-9]\d*\s*jam/.test(dur)
      });
    });
  }

  // FILTER AKHIR: Pastikan Kendala tidak null
  const finalData = data.filter(d=> d.Duration && d.Duration!=='-' && d.Kendala && d.Kendala.toLowerCase()!=='null');

  return res.json({ data: finalData, total: finalData.length, gid, menu, filter: 'Detail Outage NOT NULL' });
}