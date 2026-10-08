export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const gid = req.query.gid || '285923348';
    let csvUrl = process.env.SHEET_CSV_URL || '';
    if (csvUrl.includes('/edit')) {
      const m = csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (m) csvUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
    }
    if (!csvUrl.includes('gid=')) csvUrl += `${csvUrl.includes('?')? '&' : '?'}gid=${gid}&single=true`;

    const csv = await (await fetch(csvUrl)).text();

    function parseCSV(t){
      const rows=[]; let curRow=[],cur='',q=false;
      for(let i=0;i<t.length;i++){
        const c=t[i],n=t[i+1];
        if(c=='"'){ if(q&&n=='"'){cur+='"'; i++;} else q=!q; }
        else if(c==','&&!q){curRow.push(cur); cur='';}
        else if((c=='\n'||c=='\r')&&!q){ if(c=='\r'&&n=='\n') i++; curRow.push(cur); rows.push(curRow); curRow=[]; cur='';}
        else cur+=c;
      }
      if(cur||curRow.length){curRow.push(cur); rows.push(curRow);}
      return rows;
    }

    const allRows = parseCSV(csv).filter(r=>r.join('').trim()!=='');
    const dataRows = allRows.slice(2);

    const bulan = {jan:0,feb:1,mar:2,apr:3,mei:4,may:4,jun:5,jul:6,agu:7,aug:7,sep:8,okt:9,oct:9,nov:10,des:11,dec:11};
    const toDay = (s)=>{
      if(!s) return null; s=s.toString().trim();
      let m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if(m) return s;
      m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); if(m){let a=+m[1],b=+m[2],y=m[3]; if(a>12) return `${y}-${String(b).padStart(2,'0')}-${String(a).padStart(2,'0')}`; return `${y}-${String(a).padStart(2,'0')}-${String(b).padStart(2,'0')}`;}
      m=s.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/); if(m){let y=+m[3]; if(y<100) y+=2000; return `${y}-${String((bulan[m[2].toLowerCase()]??0)+1).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;}
      m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); if(m) return `${m[3]}-${String((bulan[m[2].toLowerCase()]??0)+1).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`; return null;
    };

    // 1. GROUPING dulu: 1 tanggal bisa 3 baris (Pos + Duration + RFO)
    let groups = [];
    let curGroup = null;
    let lastTgl = '';
    for(const cols of dataRows){
      const rawTgl = (cols[0]||'').trim();
      const detail = (cols[4]||'').toString().trim(); // Kolom E = Detail Outage Icon
      if(rawTgl){
        lastTgl = rawTgl;
        if(curGroup) groups.push(curGroup);
        curGroup = {tgl: lastTgl, details: []};
      }
      if(!curGroup) continue;
      if(detail) curGroup.details.push(detail);
    }
    if(curGroup) groups.push(curGroup);

    // 2. PARSE tiap group
    let raw=[];
    for(const g of groups){
      const fullText = g.details.join('\n'); // jadi "1. Pos PGA Rinjani\nDuration : 11.23...\nRFO : Gangguan..."
      if(!fullText) continue;

      // Regex kuat: bisa 1 Pos bisa 3 Pos dalam 1 cell, pakai enter atau spasi
      const regex = /(\d+)\.\s*(.*?)\s+Duration\s*:\s*(.*?)\s+RFO\s*:\s*(.*?)(?=\s+\d+\.\s+|$)/gs;
      let m; let found=false;
      while((m = regex.exec(fullText))!== null){
        found=true;
        const nodeName = m[2].trim();
        const kendala = `Duration : ${m[3].trim()} RFO : ${m[4].trim()}`; // HAPUS NODE DI KENDALA
        if(!nodeName || /^(Duration|RFO)/i.test(nodeName)) continue;
        raw.push({Tanggal:g.tgl,"Node/Pos":nodeName,LINK:'Icon',KENDALA:kendala,_day:toDay(g.tgl)});
      }

      // Fallback kalau cuma 1 Pos tanpa nomor urut
      if(!found && /Duration/i.test(fullText)){
        const durIdx = fullText.search(/Duration\s*:/i);
        if(durIdx>0){
          let nodeName = fullText.substring(0,durIdx).replace(/^\d+\.\s+/,'').trim().split('\n').pop().trim();
          // ambil baris terakhir sebelum Duration yang ada Pos nya
          const lines = fullText.substring(0,durIdx).split('\n').filter(Boolean);
          nodeName = lines[lines.length-1]?.replace(/^\d+\.\s+/,'').trim() || nodeName;
          const kendala = fullText.substring(durIdx).trim();
          if(nodeName) raw.push({Tanggal:g.tgl,"Node/Pos":nodeName,LINK:'Icon',KENDALA:kendala,_day:toDay(g.tgl)});
        }
      }
    }

    const byNode={}; raw.forEach(o=>{ if(!byNode[o["Node/Pos"]]) byNode[o["Node/Pos"]]=new Set(); if(o._day) byNode[o["Node/Pos"]].add(o._day); });
    const is3H=(node,day)=>{ const days=[...(byNode[node]||[])].sort(); const idx=days.indexOf(day); if(idx<2) return false; const d1=new Date(days[idx-2]),d2=new Date(days[idx-1]),d3=new Date(days[idx]); return (d2-d1)/86400000===1 && (d3-d2)/86400000===1; };
    const data=raw.map(o=>({...o,is3HPlus:is3H(o["Node/Pos"],o._day)}));

    return res.status(200).json({
      data,
      total:data.length,
      total3H:data.filter(x=>x.is3HPlus).length,
      count3hari:Object.keys(byNode).length,
      potongan:Object.values(Object.fromEntries([...data].sort((a,b)=>new Date(a._day)-new Date(b._day)).map(o=>[o["Node/Pos"],o]))),
      totalPotongan:Object.keys(byNode).length
    });
  }catch(e){
    return res.status(200).json({data:[], error:e.message});
  }
}