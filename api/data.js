export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const qMenu = (req.query.menu||'').toLowerCase();
  const qGid = req.query.gid||'';
  let gid = '0'; // Icon
  if(qMenu==='dtp' || qMenu==='1' || qGid==='285923348' || qGid==='1') gid='285923348';

  const PUB = process.env.SHEET_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRs7guoNrzRDNg8bP5epCOXStLlQsd9Ba8hPLweqQELJ5i0e-oEa6KRV1UYZpkvDJLOq8-XtVMn5hls/pub?output=csv';
  const BASE = PUB.split('/pub')[0]+'/pub';
  const SHEET_ID = '1f83CxoN-7Oqa_F7LwqejfK8bIrpW0wGJgZAkkeVgbik';

  const urls = [
    `${BASE}?gid=${gid}&single=true&output=csv&t=${Date.now()}`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}&t=${Date.now()}`
  ];

  let text='';
  for(const u of urls){
    try{ const r=await fetch(u); const t=await r.text(); if(r.ok && t.length>100 &&!t.includes('<!DOCTYPE')){ text=t; break; } }catch{}
  }
  if(!text) return res.json({data:[], gid});

  // parser CSV yang tahan \n di dalam cell
  const parseCSV = (txt)=>{ const rows=[]; let cr=[],cc='',iq=false; for(let i=0;i<txt.length;i++){ const c=txt[i],n=txt[i+1]; if(c=='"'){ if(iq&&n=='"'){cc+='"';i++;}else iq=!iq; } else if(c==','&&!iq){cr.push(cc);cc='';} else if((c=='\n'||c=='\r')&&!iq){ if(cc||cr.length){cr.push(cc);rows.push(cr);cr=[];cc='';} if(c=='\r'&&n=='\n') i++; } else cc+=c; } if(cc||cr.length){cr.push(cc);rows.push(cr);} return rows; };

  const rows = parseCSV(text);
  const hIdx = rows.findIndex(r=>r.join('').toLowerCase().includes('backhaul'));
  let data=[];

  for(let i=hIdx+1;i<rows.length;i++){
    const cols = rows[i];
    const tgl = (cols[0]||'').trim();
    if(!tgl) continue;

    // === INI KUNCINYA SOBAT! ===
    // ICON ada di kolom 5 (index 5), DTP ada di kolom 10 (index 10) sesuai SS kamu
    // Kita ambil sesuai gid, jangan pakai find!
    let detail = '';
    if(gid==='0'){ // ICON
      detail = cols[5] || cols[4] || cols[3] || '';
    } else { // DTP
      detail = cols[10] || cols[9] || cols[11] || '';
      // kalau CSV single=true DTP, detail jadi di cols[1] atau cols[2]
      if(!detail ||!detail.includes('Duration')) detail = cols[1] || cols[2] || cols[0] || '';
    }
    // kalau masih kosong, fallback cari Duration di setengah kanan/kiri
    if(!detail.includes('Duration')){
      const half = gid==='0'? cols.slice(0,6).join('\n') : cols.slice(6).join('\n');
      if(half.includes('Duration')) detail = half;
    }

    if(!detail ||!detail.includes('Duration')) continue;

    const parts = detail.split(/\n\s*(?=\d+\.\s)/g);
    parts.forEach(p=>{
      const clean=p.trim(); if(clean.length<10) return;
      const lines=clean.split('\n').map(s=>s.trim()).filter(Boolean);
      let name=lines[0].replace(/^\d+[\.\)]\s*/,'').split(/Duration/i)[0].trim();
      if(!name||name.length<3) return;
      const dur = clean.match(/Duration\s*:\s*([^\n]+)/i)?.[1]?.trim()||'-';
      const rfo = clean.match(/RFO\s*:\s*([^\n]+)/i)?.[1]?.trim()||'-';
      if(dur==='-'||dur.toLowerCase()==='null') return;

      data.push({
        Tanggal: tgl,
        "Node/Pos": name,
        Duration: dur,
        RFO: rfo,
        _raw: clean,
        source: gid==='0'?'icon':'dtp'
      });
    });
  }

  // 3 hari berturut per node
  const freq={}; data.forEach(d=>{ freq[d["Node/Pos"]]=(freq[d["Node/Pos"]]||0)+1; });
  data=data.map(d=>({...d, is3HPlus: freq[d["Node/Pos"]]>=3 }));

  return res.json({data, total:data.length, gid, menu:gid==='0'?'icon':'dtp'});
}