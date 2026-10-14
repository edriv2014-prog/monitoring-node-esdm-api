export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const menu = (req.query.menu||'icon').toLowerCase();

  const SHEET_ID = '1f83CxoN-7Oqa_F7LwqejfK8bIrpW0wGJgZAkkeVgbik';
  const BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRs7guoNrzRDNg8bP5epCOXStLlQsd9Ba8hPLweqQELJ5i0e-oEa6KRV1UYZpkvDJLOq8-XtVMn5hls/pub';

  // SELALU ambil gid=0 (tab utama yang ada ICON + DTP berdampingan)
  const urls = [
    `${BASE}?gid=0&single=true&output=csv&t=${Date.now()}`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0&t=${Date.now()}`
  ];

  let text='';
  for(const u of urls){ try{ const r=await fetch(u); const t=await r.text(); if(t.includes('Duration')){ text=t; break; } }catch{} }

  const parseCSV=(txt)=>{ const rows=[]; let cr=[],cc='',iq=false; for(let i=0;i<txt.length;i++){ const c=txt[i],n=txt[i+1]; if(c=='"'){ if(iq&&n=='"'){cc+='"';i++;}else iq=!iq; } else if(c==','&&!iq){cr.push(cc);cc='';} else if((c=='\n'||c=='\r')&&!iq){ if(cc||cr.length){cr.push(cc);rows.push(cr);cr=[];cc='';} if(c=='\r'&&n=='\n') i++; } else cc+=c; } if(cc||cr.length){cr.push(cc);rows.push(cr);} return rows; };

  const rows = parseCSV(text);
  const hIdx = rows.findIndex(r=>r.join('').includes('Backhaul'));
  let data=[];

  for(let i=hIdx+1;i<rows.length;i++){
    const cols=rows[i];
    const tgl=(cols[0]||'').trim(); if(!tgl) continue;

    // SESUAI SS KAMU
    let detailIcon = cols[5] || ''; // kolom F
    let detailDtp = cols[10] || cols[9] || ''; // kolom K

    let detail = menu==='dtp'? detailDtp : detailIcon;
    if(!detail.includes('Duration')) continue;

    detail.split(/\n\s*(?=\d+\.\s)/g).forEach(p=>{
      const clean=p.trim(); if(clean.length<10) return;
      let name=clean.split('\n')[0].replace(/^\d+[\.\)]\s*/,'').split(/Duration/i)[0].trim();
      const dur=clean.match(/Duration\s*:\s*([^\n]+)/i)?.[1]?.trim()||'-';
      const rfo=clean.match(/RFO\s*:\s*([^\n]+)/i)?.[1]?.trim()||'-';
      if(dur==='-') return;
      data.push({ Tanggal:tgl, "Node/Pos":name, Duration:dur, RFO:rfo });
    });
  }
  return res.json({data, total:data.length, menu});
}