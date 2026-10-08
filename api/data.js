
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const gid=req.query.gid||'285923348';
    let csvUrl=process.env.SHEET_CSV_URL||'';
    if(!csvUrl) throw new Error('SHEET_CSV_URL kosong');
    if(csvUrl.includes('/edit')){
      const m=csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if(m) csvUrl=`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
    }
    if(!csvUrl.includes('gid=')) csvUrl+=(csvUrl.includes('?')?'&':'?')+`gid=${gid}&single=true`;

    const r = await fetch(csvUrl);
    if(!r.ok) throw new Error('Gagal fetch sheet: ' + r.status);
    const csv = await r.text();

    function parseCSV(text){
      const rows=[]; let curRow=[]; let cur=''; let inQuote=false;
      for(let i=0;i<text.length;i++){
        const c=text[i]; const next=text[i+1];
        if(c=='"'){ if(inQuote && next=='"'){ cur+='"'; i++; } else inQuote=!inQuote; }
        else if(c==',' &&!inQuote){ curRow.push(cur); cur=''; }
        else if((c=='\n' || c=='\r') &&!inQuote){ if(c=='\r' && next=='\n') i++; curRow.push(cur); rows.push(curRow); curRow=[]; cur=''; }
        else cur+=c;
      }
      if(cur || curRow.length){ curRow.push(cur); rows.push(curRow); }
      return rows;
    }

    const allRows = parseCSV(csv).filter(row => row.join('').trim()!== '');
    const dataRows = allRows.slice(2);

    const bulan = {Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const toDay = (s)=>{
      if(!s) return null;
      s=s.toString().trim();
      let m=s.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/);
      if(m){ let y=+m[3]; if(y<100) y+=2000; return new Date(Date.UTC(y, bulan[m[2]]??0, +m[1])).toISOString().slice(0,10); }
      m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
      if(!m) return null;
      return new Date(Date.UTC(+m[3], bulan[m[2]]??0, +m[1])).toISOString().slice(0,10);
    };

    let lastTgl=''; let raw=[];
    for(let i=0;i<dataRows.length;i++){
      const cols=dataRows[i];
      const get=(idx)=>(cols[idx]||'').toString().trim();
      let tgl=get(0)||lastTgl; if(tgl) lastTgl=tgl; if(!tgl) continue;
      const detail=get(4)||''; if(!detail) continue;

      // FIX UTAMA: Pisah per nomor saja, JANGAN pisah per baris \n
      // 1 Pos = 1 chunk utuh berisi Nama + Duration + RFO
      const chunks = detail.split(/\n\s*\d+\.\s+/);
      // chunk pertama masih ada "1. " di depan, bersihkan
      const cleanChunks = chunks.map(c=>c.replace(/^\s*\d+\.\s+/,'').trim()).filter(Boolean);

cleanChunks.forEach(full=>{
  if(!full) return
  if(/^(Duration|RFO)\s*:/i.test(full)) return

  const durIdx = full.search(/Duration\s*:/i)
  let nodeName, kendala

  if(durIdx > 0){
    nodeName = full.substring(0, durIdx).trim()
    kendala = full.substring(durIdx).trim() // HAPUS NODE, ambil mulai dari Duration
  } else {
    nodeName = full.split('\n')[0].trim()
    kendala = full
  }

  nodeName = nodeName.replace(/^\d+\.\s+/,'').trim()
  if(!nodeName) return

  raw.push({
    Tanggal: tgl,
    "Node/Pos": nodeName,
    LINK: 'Icon',
    KENDALA: kendala, // Sekarang isinya cuma "Duration : 26/11/2025... RFO :..."
    _day: toDay(tgl)
  })
})
    }

    // 3H+
    const byNode={}; raw.forEach(o=>{ if(!byNode[o["Node/Pos"]]) byNode[o["Node/Pos"]]=new Set(); if(o._day) byNode[o["Node/Pos"]].add(o._day); });
    const is3H=(node,day)=>{ const days=[...(byNode[node]||[])].sort(); const idx=days.indexOf(day); if(idx<2) return false; const d1=new Date(days[idx-2]),d2=new Date(days[idx-1]),d3=new Date(days[idx]); return (d2-d1===86400000)&&(d3-d2===86400000); };
    const data=raw.map(o=>({...o, is3HPlus:is3H(o["Node/Pos"],o._day)}));

    const potonganMap={}; [...data].sort((a,b)=>new Date(a._day)-new Date(b._day)).forEach(o=>{ if(!potonganMap[o["Node/Pos"]]) potonganMap[o["Node/Pos"]]=o; });

    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ data, potongan:Object.values(potonganMap), total:data.length, url:csvUrl });
  } catch(e){ return res.status(200).json({data:[], error:e.message, total:0}); }
}
