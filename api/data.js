export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Support?menu=icon/dtp ATAU?gid=0/1 dari frontend lama
  let menu = req.query.menu || '';
  let reqGid = req.query.gid || '';

  let gid = '0'; // default Icon
  if (menu === '1' || menu === 'dtp' || menu === 'DTP' || reqGid === '1' || reqGid === '285923348') {
    gid = '285923348'; // DTP
  } else if (menu === '0' || menu === 'icon' || menu === 'ICON' || reqGid === '0') {
    gid = '0'; // Icon
  }

  // ENV kamu: https://docs.google.com/spreadsheets/d/e/2PACX-1vRs7guoNrzRDNg8bP5epCOXStLlQsd9Ba8hPLweqQELJ5i0e-oEa6KRV1UYZpkvDJLOq8-XtVMn5hls/pub?output=csv
  const ENV_PUB = process.env.SHEET_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRs7guoNrzRDNg8bP5epCOXStLlQsd9Ba8hPLweqQELJ5i0e-oEa6KRV1UYZpkvDJLOq8-XtVMn5hls/pub?output=csv';
  const PUB_BASE = ENV_PUB.split('/pub')[0] + '/pub';
  const SHEET_ID_REAL = '1f83CxoN-7Oqa_F7LwqejfK8bIrpW0wGJgZAkkeVgbik';

  const urlsToTry = [
    `${PUB_BASE}?gid=${gid}&single=true&output=csv&t=${Date.now()}`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID_REAL}/export?format=csv&gid=${gid}&t=${Date.now()}`,
    ENV_PUB // fallback
  ];

  let text = '', csvUrl = '';
  for (const u of urlsToTry) {
    try {
      csvUrl = u;
      const r = await fetch(u);
      const t = await r.text();
      if (r.ok &&!t.includes('<!DOCTYPE') && t.length > 50) { text = t; break; }
    } catch(e){}
  }
  if (!text) return res.json({ data: [], error: 'Fetch gagal', gid, menu, csvUrl });

  // Parser robust biar cell yang ada \n gak kepotong
  const parseCSV = (txt) => {
    const rows=[]; let cr=[],cc='',iq=false;
    for(let i=0;i<txt.length;i++){ const c=txt[i],n=txt[i+1]; if(c=='"'){ if(iq&&n=='"'){cc+='"';i++;}else iq=!iq; } else if(c==','&&!iq){cr.push(cc);cc='';} else if((c=='\n'||c=='\r')&&!iq){ if(cc||cr.length){cr.push(cc);rows.push(cr);cr=[];cc='';} if(c=='\r'&&n=='\n') i++; } else cc+=c; }
    if(cc||cr.length){cr.push(cc);rows.push(cr);}
    return rows;
  };

  const rows = parseCSV(text);
  let hIdx = rows.findIndex(r=>r.join('').toLowerCase().includes('backhaul')); if(hIdx===-1) hIdx=0;

  let data=[];
  for(let i=hIdx+1;i<rows.length;i++){
    let cols=rows[i]; if(cols.length<3) continue;
    let tgl=(cols[0]||'').trim(); if(!tgl||tgl.toLowerCase().includes('backhaul')) continue;

    // FIX: Detail Outage tidak null - Icon di col 3, DTP di col 4
    let detail = cols.find(c=>/Duration\s*:/i.test(c)) || '';
    if(!detail) detail = gid==='285923348'? (cols[4]||cols[3]||'') : (cols[3]||cols[4]||'');

    // FILTER yang null
    if(!detail) continue;
    const cek = detail.trim().toLowerCase();
    if(cek===''||cek==='-'||cek==='null'||cek==='undefined') continue;

    let parts=detail.split(/\n\s*(?=\d+\.\s)/g); if(parts.length<=1) parts=[detail];
    parts.forEach(p=>{
      let clean=p.trim(); if(clean.length<5) return;
      let lines=clean.split('\n').map(s=>s.trim()).filter(Boolean);
      let nameRaw=lines[0]||'';
      let name=nameRaw.replace(/^\d+[\.\)]\s*/,'').trim().split(/Duration|RFO/i)[0].trim();
      if(!name||name.length<3) return;
      if(/duration|rfo/i.test(name)) return;

      let dur=(clean.match(/Duration\s*:\s*([^\n]+)/i)?.[1]||'').trim();
      let rfo=(clean.match(/RFO\s*:\s*([^\n]+)/i)?.[1]||'').trim();

      if(!dur||dur==='-'||dur.toLowerCase()==='null') return; // Kendala null skip

      data.push({
        Tanggal: tgl,
        "Node/Pos": name,
        Duration: dur,
        RFO: rfo||'-',
        Kendala: `Duration : ${dur} RFO : ${rfo}`,
        LINK: 'Normal',
        is3HPlus: /[1-9]\d*\s*jam/.test(dur),
        _raw: clean
      });
    });
  }

  return res.json({ data, total: data.length, gid, menu: gid==='285923348'?'dtp':'icon', csvUrl });
}