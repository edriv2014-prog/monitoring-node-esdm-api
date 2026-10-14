export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const menu = (req.query.menu||'icon').toLowerCase();
  const isDebug = req.query.debug==='1';

  const SHEET_ID = '1f83CxoN-7Oqa_F7LwqejfK8bIrpW0wGJgZAkkeVgbik';
  const BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRs7guoNrzRDNg8bP5epCOXStLlQsd9Ba8hPLweqQELJ5i0e-oEa6KRV1UYZpkvDJLOq8-XtVMn5hls/pub';

  const urls = [
    `${BASE}?gid=0&single=true&output=csv&t=${Date.now()}`,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0&t=${Date.now()}`,
    `${BASE}?output=csv&t=${Date.now()}`
  ];

  let text='';
  for(const u of urls){
    try{
      const r=await fetch(u);
      const t=await r.text();
      if(r.ok && t.includes('Duration') && t.length>500){
        text=t;
        break;
      }
    }catch{}
  }

  if(!text){
    return res.status(200).json({data:[], total:0, menu, error:'Gagal fetch CSV, cek SHEET_ID'});
  }

  // CSV parser tahan newline di dalam cell
  const parseCSV=(txt)=>{
    const rows=[]; let curRow=[], cur='', inQ=false;
    for(let i=0;i<txt.length;i++){
      const c=txt[i], n=txt[i+1];
      if(c=='"'){
        if(inQ && n=='"'){ cur+='"'; i++; }
        else inQ=!inQ;
      } else if(c==',' && !inQ){
        curRow.push(cur); cur='';
      } else if((c=='\n'||c=='\r') && !inQ){
        if(cur||curRow.length){ curRow.push(cur); rows.push(curRow); curRow=[]; cur=''; }
        if(c=='\r' && n=='\n') i++;
      } else {
        cur+=c;
      }
    }
    if(cur||curRow.length){ curRow.push(cur); rows.push(curRow); }
    return rows;
  };

  const rows = parseCSV(text);
  const hIdx = rows.findIndex(r=> r.join(' ').toLowerCase().includes('backhaul'));

  if(isDebug){
    const sample = rows[hIdx+1] || [];
    const durCols = sample.map((c,i)=> c.includes('Duration')? {index:i, preview: c.substring(0,120)} : null).filter(Boolean);
    return res.json({
      menu,
      totalRows: rows.length,
      headerIndex: hIdx,
      headerRow: rows[hIdx] || [],
      sampleRowCols: sample.length,
      sampleRow: sample,
      durationColumns: durCols
    });
  }

  let data=[];
  for(let i=hIdx+1;i<rows.length;i++){
    const cols=rows[i];
    if(!cols || cols.length<2) continue;
    const tgl=(cols[0]||'').trim();
    if(!tgl) continue;

    // AUTO-DETECT: semua kolom yang ada kata Duration
    const durCols = cols.map((c,idx)=>({txt:(c||''), idx})).filter(o=> o.txt.includes('Duration'));

    // ICON = Duration pertama, DTP = Duration kedua (sesuai SS kamu)
    // 13 Okt: ICON = "Kampus + Pos PGA", DTP = "Kampus" doang
    let detail = '';
    if(menu==='icon'){
      detail = durCols[0]?.txt || '';
    } else {
      // DTP: kalau ada 2 kolom Duration, ambil yang kedua
      // kalau cuma 1 kolom Duration, berarti sheet ini cuma ICON, jadi DTP = kosong -> sesuai fakta Pos PGA cuma di ICON
      detail = durCols[1]?.txt || '';
      // Kalau kamu mau DTP fallback ke data ICON bila DTP kosong, uncomment baris bawah:
      // if(!detail) detail = durCols[0]?.txt || '';
    }

    if(!detail || !detail.includes('Duration')) continue;

    // Pecah "1. Kampus ... 2. Pos PGA ..."
    const parts = detail.split(/\n\s*(?=\d+\.\s)/g);
    parts.forEach(p=>{
      const clean=p.trim();
      if(clean.length<10) return;
      let name = clean.split('\n')[0].replace(/^\d+[\.\)]\s*/,'').split(/Duration/i)[0].trim();
      name = name.replace(/\s+/g,' ').trim();
      if(!name || name.length<3) return;
      const dur = clean.match(/Duration\s*:\s*([^\n]+)/i)?.[1]?.trim() || '-';
      const rfo = clean.match(/RFO\s*:\s*([^\n]+)/i)?.[1]?.trim() || '-';
      if(dur==='-' || dur.toLowerCase()==='null' || !dur) return;

      data.push({
        Tanggal: tgl,
        "Node/Pos": name,
        Duration: dur,
        RFO: rfo,
        _raw: clean
      });
    });
  }

  return res.status(200).json({
    data,
    total: data.length,
    menu,
    info: menu==='icon' ? 'Kampus + Pos PGA Lamongan' : 'Hanya yang ada di kolom DTP (Kampus doang, Pos PGA tidak ada)'
  });
}
