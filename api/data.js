export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const gid = req.query.gid || '285923348';
    let csvUrl = process.env.SHEET_CSV_URL || '';
    if (!csvUrl) throw new Error('SHEET_CSV_URL kosong');
    if (csvUrl.includes('/edit')) {
      const m = csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (m) csvUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
    }
    if (!csvUrl.includes('gid=')) csvUrl += `${csvUrl.includes('?')? '&' : '?'}gid=${gid}&single=true`;

    const csv = await (await fetch(csvUrl)).text();

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

    // === 1. GROUP: 1 tanggal bisa 3 baris fisik (Pos + Duration + RFO) ===
    let groups = [];
    let curGroup = null;
    let lastTgl = '';
    for(let i=0;i<dataRows.length;i++){
      const cols=dataRows[i];
      const get=(idx)=>(cols[idx]||'').toString().trim();
      const rawTgl = get(0);
      const detail = get(4); // Kolom E = Detail Outage Icon
      if(rawTgl){
        lastTgl = rawTgl;
        if(curGroup) groups.push(curGroup);
        curGroup = {tgl: lastTgl, details: []};
      }
      if(!curGroup) continue;
      if(detail) curGroup.details.push(detail);
    }
    if(curGroup) groups.push(curGroup);

    // === 2. PARSE tiap tanggal ===
    let raw=[];
    for(const g of groups){
      // Gabung semua baris dalam tanggal yang sama, pertahankan newline
      const fullText = g.details.join('\n');
      if(!fullText) continue;

      // Regex FINAL: tangkap semua pola
      // "1. Pos PGA Kaba Duration : ... RFO : ..."
      // "Duration : ... RFO : ..." (tanpa node) -> akan fallback
      const regex = /(?:^|\n|\s)(\d+)\.\s*(.*?)\s*Duration\s*:\s*(.*?)\s*RFO\s*:\s*(.*?)(?=\s*\d+\.\s+|$)/gs;
      let match;
      let found=false;
      while((match = regex.exec(fullText))!== null){
        found=true;
        const nodeName = match[2].trim();
        const dur = match[3].trim().replace(/\n/g,' ').replace(/\s+/g,' ');
        const rfo = match[4].trim().replace(/\n/g,' ').replace(/\s+/g,' ');
        if(!nodeName) continue;
        raw.push({
          Tanggal: g.tgl,
          "Node/Pos": nodeName,
          LINK: 'Icon',
          KENDALA: `Duration : ${dur} RFO : ${rfo}`,
          _day: toDay(g.tgl)
        });
      }

      // Fallback kalau cuma 1 Pos tanpa nomor (harusnya tidak terjadi untuk 5 & 6 Sep tapi jaga2)
      if(!found){
        // Coba pecah manual per "1." "2."
        const parts = fullText.split(/(?=\d+\.\s+Pos|^\d+\.\s+Pos)/gm).map(s=>s.trim()).filter(Boolean);
        for(const part of parts){
          const durIdx = part.search(/Duration\s*:/i);
          if(durIdx>0){
            const node = part.substring(0,durIdx).replace(/^\d+\.\s+/,'').trim().split('\n')[0].trim();
            const kendala = part.substring(durIdx).replace(/\n/g,' ').replace(/\s+/g,' ').trim();
            if(node) raw.push({Tanggal:g.tgl,"Node/Pos":node,LINK:'Icon',KENDALA:kendala,_day:toDay(g.tgl)});
          }
        }
      }
    }

    const byNode={}; raw.forEach(o=>{ if(!byNode[o["Node/Pos"]]) byNode[o["Node/Pos"]]=new Set(); if(o._day) byNode[o["Node/Pos"]].add(o._day); });
    const is3H=(node,day)=>{ const days=[...(byNode[node]||[])].sort(); const idx=days.indexOf(day); if(idx<2) return false; const d1=new Date(days[idx-2]),d2=new Date(days[idx-1]),d3=new Date(days[idx]); return (d2-d1===86400000)&&(d3-d2===86400000); };
    const data=raw.map(o=>({...o, is3HPlus:is3H(o["Node/Pos"],o._day)}));
    const potonganMap={}; [...data].sort((a,b)=>new Date(a._day)-new Date(b._day)).forEach(o=>{ if(!potonganMap[o["Node/Pos"]]) potonganMap[o["Node/Pos"]]=o; });

    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ 
      data, 
      potongan:Object.values(potonganMap), 
      total:data.length, 
      total3H:data.filter(x=>x.is3HPlus).length,
      url:csvUrl 
    });
  } catch(e){ return res.status(200).json({data:[], error:e.message, total:0}); }
}
