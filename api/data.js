export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const gid = req.query.gid || '0';
  const sheetId = process.env.GOOGLE_SHEET_ID || '1L4UqJ4a2tR6Z...'; // ganti ID sheet kamu
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  try{
    const r = await fetch(url); const csv = await r.text();
    const lines = csv.split('\n');
    // Cari header
    const headerLine = lines.find(l=> l.toLowerCase().includes('tanggal'));
    const hIdx = lines.indexOf(headerLine);
    const headers = headerLine.split(',').map(h=>h.trim().replace(/"/g,''));
    let out=[];
    for(let i=hIdx+1;i<lines.length;i++){
      let line=lines[i]; if(!line.trim()) continue;
      // split CSV simple
      let cols=[]; let cur=''; let inQ=false; for(let c of line){ if(c=='"') inQ=!inQ; else if(c==','&&!inQ){ cols.push(cur); cur=''; } else cur+=c; } cols.push(cur);
      let obj={}; headers.forEach((h,idx)=> obj[h]=cols[idx]||'');
      // Jika ada kolom yang berisi "1. Pusdatin Duration : 14 jam RFO : ..." split jadi banyak row
      const nodeRaw = obj["Node/Pos"] || obj["NODE/POS"] || obj["Node"] || cols[4] || "";
      // Regex pecah per nomor: "1. Nama\nDuration : ...\nRFO : ...\n\n2. Nama..."
      const multi = nodeRaw.split(/\n\s*(?=\d+\.\s)/); // split jika ada "2. "
      if(multi.length>1){
        multi.forEach(m=>{
          let name = m.match(/^\d+\.\s*([^\n]+)/); name=name?name[1].trim():clean(m);
          let dur = m.match(/Duration\s*:\s*([^\n]+)/i); dur=dur?dur[1].trim():'-';
          let rfo = m.match(/RFO\s*:\s*([\s\S]*)/i); rfo=rfo?rfo[1].trim().replace(/\n/g,' ').slice(0,300):'-';
          out.push({
            Tanggal: obj["Tanggal"]||obj["TANGGAL"]||'',
            "Node/Pos": name,
            Kendala: rfo,
            Duration: dur,
            RFO: rfo,
            LINK: obj["LINK"]||obj["Link"]||'Normal',
            STATUS: dur && !dur.includes('-') ? '3H+ MERAH' : 'Bagus',
            is3HPlus: /jam|menit/.test(dur) && !dur.includes('0') ? true : false,
            _raw: m
          });
        });
      }else{
        let dur = (obj["Duration"]||obj["DURATION"]|| nodeRaw.match(/Duration\s*:\s*([^\n]+)/i)?.[1]||'').trim();
        let rfo = (obj["RFO"]||obj["RFO "]|| nodeRaw.match(/RFO\s*:\s*([\s\S]*)/i)?.[1]||'').trim();
        out.push({
          Tanggal: obj["Tanggal"]||'',
          "Node/Pos": clean(nodeRaw.split('\n')[0]),
          Kendala: rfo || obj["Kendala"] || '-',
          Duration: dur || '-',
          RFO: rfo || '-',
          LINK: obj["LINK"]||'Normal',
          STATUS: obj["STATUS"]||'',
          is3HPlus: /[1-9]\s*jam/.test(dur),
          _raw: nodeRaw
        });
      }
    }
    function clean(s){ let v=String(s||''); v=v.replace(/^\s*[\d\.\-\)\:\s]+/g,'').trim(); return v.split('\n')[0].trim(); }
    res.json({data:out, total:out.length});
  }catch(e){ res.status(500).json({error:e.message}); }
}
