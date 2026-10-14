export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Support?menu=icon/dtp atau?gid=0/1 atau?menu=0/1
  const qMenu = (req.query.menu || '').toString().toLowerCase();
  const qGid = (req.query.gid || '').toString();

  let gid = '0'; // default Icon
  if (qMenu === '1' || qMenu === 'dtp' || qMenu === '285923348' || qGid === '1' || qGid === '285923348') {
    gid = '285923348'; // DTP
  }

  const ENV_PUB = process.env.SHEET_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRs7guoNrzRDNg8bP5epCOXStLlQsd9Ba8hPLweqQELJ5i0e-oEa6KRV1UYZpkvDJLOq8-XtVMn5hls/pub?output=csv';
  const PUB_BASE = ENV_PUB.split('/pub')[0] + '/pub';
  const SHEET_ID_REAL = '1f83CxoN-7Oqa_F7LwqejfK8bIrpW0wGJgZAkkeVgbik';

  const urls = [
    `${PUB_BASE}?gid=${gid}&single=true&output=csv&t=${Date.now()}`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID_REAL}/export?format=csv&gid=${gid}&t=${Date.now()}`,
    ENV_PUB
  ];

  let text = '', csvUrl = '';
  for (const u of urls) {
    try {
      csvUrl = u;
      const r = await fetch(u);
      const t = await r.text();
      if (r.ok &&!t.includes('<!DOCTYPE') && t.length > 100) { text = t; break; }
    } catch (e) {}
  }
  if (!text) return res.json({ data: [], error: 'Fetch gagal', gid, csvUrl });

  const parseCSV = (txt) => {
    const rows=[]; let cr=[],cc='',iq=false;
    for(let i=0;i<txt.length;i++){ const c=txt[i],n=txt[i+1]; if(c=='"'){ if(iq&&n=='"'){cc+='"';i++;}else iq=!iq; } else if(c==','&&!iq){cr.push(cc);cc='';} else if((c=='\n'||c=='\r')&&!iq){ if(cc||cr.length){cr.push(cc);rows.push(cr);cr=[];cc='';} if(c=='\r'&&n=='\n') i++; } else cc+=c; }
    if(cc||cr.length){cr.push(cc);rows.push(cr);}
    return rows;
  };

  const rows = parseCSV(text);
  const hIdx = rows.findIndex(r=>r.join('').toLowerCase().includes('backhaul'));
  let data = [];

  for(let i=hIdx+1;i<rows.length;i++){
    let cols=rows[i]; if(cols.length<3) continue;
    let tgl=(cols[0]||'').trim(); if(!tgl||tgl.toLowerCase().includes('backhaul')) continue;

    // Detail Outage tidak null - Icon col 3, DTP col 4
    let detail = cols.find(c=>/Duration\s*:/i.test(c)) || '';
    if(!detail) detail = gid==='285923348'? (cols[4]||cols[3]||'') : (cols[3]||cols[4]||'');
    if(!detail||detail.trim()===''||detail.trim()==='-'||detail.toLowerCase()==='null') continue;

    let parts=detail.split(/\n\s*(?=\d+\.\s)/g); if(parts.length<=1) parts=[detail];
    parts.forEach(p=>{
      let clean=p.trim(); if(clean.length<5) return;
      let lines=clean.split('\n').map(s=>s.trim()).filter(Boolean);
      let nameRaw=lines[0]||'';
      let name=nameRaw.replace(/^\d+[\.\)]\s*/,'').trim().split(/Duration|RFO/i)[0].trim();
      if(!name||name.length<3||/duration|rfo/i.test(name)) return;

      let dur=(clean.match(/Duration\s*:\s*([^\n]+)/i)?.[1]||'').trim();
      let rfo=(clean.match(/RFO\s*:\s*([^\n]+)/i)?.[1]||'').trim();
      if(!dur||dur==='-'||dur.toLowerCase()==='null') return;

      data.push({
        Tanggal: tgl,
        "Node/Pos": name,
        Duration: dur,
        RFO: rfo||'-',
        Kendala: clean,
        LINK: 'Normal',
        _raw: clean
      });
    });
  }

  // Hitung 3 hari berturut-turut muncul
  const freq = {};
  data.forEach(d=>{ freq[d["Node/Pos"]] = (freq[d["Node/Pos"]]||0)+1; });
  data = data.map(d=>({...d, is3HPlus: freq[d["Node/Pos"]] >= 3 }));

  return res.json({ data, total: data.length, gid, menu: gid==='285923348'?'dtp':'icon' });
}