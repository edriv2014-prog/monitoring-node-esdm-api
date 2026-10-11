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
      if(!s) return null; s=s.toString().trim();
      let m=s.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/);
      if(m){ let y=+m[3]; if(y<100) y+=2000; return new Date(Date.UTC(y, bulan[m[2]]??0, +m[1])).toISOString().slice(0,10); }
      m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
      if(!m) return null;
      return new Date(Date.UTC(+m[3], bulan[m[2]]??0, +m[1])).toISOString().slice(0,10);
    };

    // 1. GROUP per tanggal
    let groups = [];
    let curGroup = null;
    for(const cols of dataRows){
      const get=(idx)=>(cols[idx]||'').toString();
      const rawTgl = get(0).trim();
      const detailIcon = get(4); // Detail Outage Icon
      const detailOver = get(5); // Detail Overload (kolom sebelahnya)
      if(rawTgl){
        if(curGroup) groups.push(curGroup);
        curGroup = {tgl: rawTgl, texts: []};
      }
      if(!curGroup) continue;
      // Ambil kedua kolom, Icon dan Overload, biar 18 Juni yang 6 Icon + 3 Overload semua kebaca
      if(detailIcon.trim()) curGroup.texts.push(detailIcon);
      if(detailOver.trim()) curGroup.texts.push(detailOver);
    }
    if(curGroup) groups.push(curGroup);

    // 2. PARSER FINAL: tahan format tanpa nomor "1." juga
    let raw=[];
    for(const g of groups){
      const fullText = g.texts.join('\n');
      if(!fullText) continue;

      // Pola paling stabil: [optional nomor] [Nama Pos - bisa spasi] newline Duration : ... newline RFO : ... sampai sebelum nomor berikutnya
      // Menggunakan split dengan lookahead nomor + "Pos" atau "PVMBG" atau "Wisma" atau "Tekmira" atau "Kampus" atau "PATGTL"
      const blockRegex = /(?:^|\n)\s*(?:\d+[\.\)]\s*)?(.+?)\s*\n\s*Duration\s*:\s*(.+?)\s*\n\s*RFO\s*:\s*(.+?)(?=\n\s*\d+[\.\)]\s+|\n\s*(?:Pos|PVMBG|Wisma|Tekmira|Kampus|PATGTL).*?\n\s*Duration|$)/gis;

      let m;
      let found = false;
      while((m = blockRegex.exec(fullText)) !== null){
        found = true;
        let nodeName = m[1].trim().replace(/^\d+[\.\)]\s*/,'').trim();
        // Bersihkan kalau nodeName masih kebawa "RFO : ..." dari block sebelumnya
        nodeName = nodeName.split('\n').pop().trim().replace(/^\d+[\.\)]\s*/,'').trim();
        const dur = m[2].trim().replace(/\s+/g,' ');
        const rfo = m[3].trim().replace(/\s+/g,' ');

        if(!nodeName) continue;
        if(nodeName.length < 3) continue;
        if(/^(Duration|RFO|Adanya|Monitoring)/i.test(nodeName) && nodeName.length > 15) continue;

        raw.push({
          Tanggal: g.tgl,
          "Node/Pos": nodeName,
          LINK: 'Icon',
          KENDALA: `Duration : ${dur} RFO : ${rfo}`,
          _day: toDay(g.tgl)
        });
      }

      // Fallback super simple kalau regex di atas gagal (untuk 18 Jun yang baris pertama tanpa nomor)
      if(!found){
        const parts = fullText.split(/(?=\d+[\.\)]\s+Pos|\d+[\.\)]\s+PVMBG|\d+[\.\)]\s+Wisma|\d+[\.\)]\s+Tekmira|\d+[\.\)]\s+Kampus)/g);
        for(const p of parts){
          const durIdx = p.search(/Duration\s*:/i);
          const rfoIdx = p.search(/RFO\s*:/i);
          if(durIdx>0 && rfoIdx>0){
            let node = p.substring(0, durIdx).trim().replace(/^\d+[\.\)]\s*/,'').trim().split('\n').filter(Boolean).pop() || '';
            node = node.replace(/^\d+[\.\)]\s*/,'').trim();
            const dur = p.substring(durIdx + 9, rfoIdx).trim().replace(/\s+/g,' ');
            const rfo = p.substring(rfoIdx + 4).trim().replace(/\s+/g,' ').split(/\n\d+[\.\)]/)[0].trim();
            if(node) raw.push({Tanggal:g.tgl,"Node/Pos":node,LINK:'Icon',KENDALA:`Duration : ${dur} RFO : ${rfo}`,_day:toDay(g.tgl)});
          }
        }
      }
    }

    const byNode={}; raw.forEach(o=>{ if(!byNode[o["Node/Pos"]]) byNode[o["Node/Pos"]]=new Set(); if(o._day) byNode[o["Node/Pos"]].add(o._day); });
    const is3H=(node,day)=>{ const days=[...(byNode[node]||[])].sort(); const idx=days.indexOf(day); if(idx<2) return false; const d1=new Date(days[idx-2]),d2=new Date(days[idx-1]),d3=new Date(days[idx]); return (d2-d1===86400000)&&(d3-d2===86400000); };
    const data=raw.map(o=>({...o, is3HPlus:is3H(o["Node/Pos"],o._day)}));
    const potonganMap={}; [...data].sort((a,b)=>new Date(a._day)-new Date(b._day)).forEach(o=>{ if(!potonganMap[o["Node/Pos"]]) potonganMap[o["Node/Pos"]]=o; });

    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ data, potongan:Object.values(potonganMap), total:data.length, total3H:data.filter(x=>x.is3HPlus).length, url:csvUrl });
  } catch(e){ return res.status(200).json({data:[], error:e.message, total:0}); }
}
