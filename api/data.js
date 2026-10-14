export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // BACA DARI REQUEST - menu=0 icon, menu=1 dtp
  const menu = req.query.menu;
  const reqGid = req.query.gid;

  // Mapping menu ke GID asli kamu
  let gid = '0'; // default icon
  if (menu === '1' || menu === 'dtp' || menu === 'DTP') gid = '285923348';
  else if (menu === '0' || menu === 'icon' || menu === 'ICON') gid = '0';
  else if (reqGid) gid = reqGid; // kalau frontend kirim gid langsung

  // PAKAI ENV KAMU - sesuai SS Vercel
  const ENV_PUB = process.env.SHEET_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRs7guoNrzRDNg8bP5epCOXStLlQsd9Ba8hPLweqQELJ5i0e-oEa6KRV1UYZpkvDJLOq8-XtVMn5hls/pub?output=csv';
  const SHEET_ID_REAL = '1f83CxoN-7Oqa_F7LwqejfK8bIrpW0wGJgZAkkeVgbik';
  const PUB_BASE = ENV_PUB.split('/pub')[0] + '/pub';

  const urlsToTry = [
    `${PUB_BASE}?gid=${gid}&single=true&output=csv&t=${Date.now()}`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID_REAL}/export?format=csv&gid=${gid}&t=${Date.now()}`
  ];

  let text = '', csvUrl = '', lastError = '';
  for (const u of urlsToTry) {
    try {
      csvUrl = u;
      const resp = await fetch(u);
      const t = await resp.text();
      if (resp.ok &&!t.includes('<!DOCTYPE') &&!t.includes('<html') && t.length > 10) { text = t; break; }
      lastError = t.substring(0,200);
    } catch (e) { lastError = e.message; }
  }

  if (!text) return res.status(500).json({ error: `Fetch failed gid=${gid} menu=${menu}`, gid, menu, url: csvUrl, preview: lastError });

  try {
    const parseCSV = (txt) => {
      const rows=[]; let curRow=[], curCol='', inQuote=false;
      for(let i=0;i<txt.length;i++){
        const c=txt[i], n=txt[i+1];
        if(c=='"'){ if(inQuote&&n=='"'){curCol+='"';i++;}else inQuote=!inQuote; }
        else if(c==','&&!inQuote){curRow.push(curCol);curCol='';}
        else if((c=='\n'||c=='\r')&&!inQuote){
          if(curCol||curRow.length){curRow.push(curCol);rows.push(curRow);curRow=[];curCol='';}
          if(c=='\r'&&n=='\n') i++;
        }else curCol+=c;
      }
      if(curCol||curRow.length){curRow.push(curCol);rows.push(curRow);}
      return rows;
    };
    const rows = parseCSV(text);
    let hIdx = rows.findIndex(r=>r.some(c=>/tanggal/i.test(c))); if(hIdx===-1) hIdx=0;
    let data=[];
    for(let i=hIdx+1;i<rows.length;i++){
      let cols=rows[i]; if(cols.length<2) continue;
      let tgl=(cols[0]||'').trim(); if(!tgl||/tanggal/i.test(tgl)) continue;
      if(!/Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des/i.test(tgl)) continue;
      let cell=(cols[4]||cols[3]||cols[2]||'').trim(); if(!cell) continue;
      let parts=cell.split(/\n\s*(?=\d+\.\s)/g); if(parts.length<=1) parts=[cell];
      parts.forEach(p=>{
        let clean=p.trim(); if(!clean||clean.length<3) return;
        let lines=clean.split('\n').map(s=>s.trim()).filter(Boolean);
        let name=(lines[0]||'').replace(/^\d+[\.\)]\s*/,'').trim().split(/Duration|RFO/i)[0].trim();
        if(name.length<2||/duration|rfo/i.test(name)) return;
        let dur=(clean.match(/Duration\s*:\s*([^\n]+)/i)?.[1]||'').trim();
        let rfo=(clean.match(/RFO\s*:\s*([\s\S]*?)(?=\n\s*\d+\.|$)/i)?.[1]||'').trim().replace(/\n/g,' ');
        if(!dur){ const d=lines.find(l=>/Duration/i.test(l)); if(d){ const m=d.match(/Duration\s*:\s*(.*)/i); if(m) dur=m[1].trim(); } }
        if(!rfo){ const rI=lines.findIndex(l=>/RFO/i.test(l)); if(rI>=0) rfo=lines.slice(rI).join(' ').replace(/RFO\s*:\s*/i,'').trim(); }
        data.push({Tanggal:tgl,"Node/Pos":name,Duration:dur||'-',RFO:rfo||'-',Kendala:rfo||dur||'-',LINK:'Normal',is3HPlus:/[1-9]\d*\s*jam/.test(dur)});
      });
    }
    return res.json({ data, total:data.length, gid, menu, csvUrl, source:'ENV+menu' });
  } catch(e){ return res.status(500).json({error:e.message,gid,menu}); }
}