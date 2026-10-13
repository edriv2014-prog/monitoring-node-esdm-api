export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(200).end();
  const gid = req.query.gid || '0';
  const SHEET_ID = process.env.GOOGLE_SHEET_ID || process.env.VITE_SHEET_ID || '1xxxxxxxxxxxxxxxxxxxx'; // ISI ID SHEET KAMU
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}&_=${Date.now()}`;
  try{
    const resp = await fetch(csvUrl);
    if(!resp.ok) throw new Error('Fetch sheet failed '+resp.status);
    let text = await resp.text();
    // parse CSV robust
    let lines = text.split(/\r?\n/).filter(l=> l.trim()!=='');
    if(lines.length===0) return res.json({data:[], total:0});

    // Cari baris header yang mengandung tanggal/node - kalau tidak ada, pakai baris pertama
    let hIdx = lines.findIndex(l=> /tanggal/i.test(l));
    if(hIdx===-1) hIdx = 0;
    let headerLine = lines[hIdx];
    if(!headerLine) throw new Error('Header not found gid='+gid);

    function splitCSV(line){
      let out=[], cur='', inQ=false;
      for(let i=0;i<line.length;i++){
        let c=line[i];
        if(c=='"'){ if(line[i+1]=='"'){ cur+='"'; i++; } else inQ=!inQ; }
        else if(c==',' && !inQ){ out.push(cur); cur=''; }
        else cur+=c;
      }
      out.push(cur);
      return out.map(s=> s.trim().replace(/^"|"$/g,''));
    }

    let headers = splitCSV(headerLine).map(h=> h.replace(/\s+/g,' ').trim());
    // Kalau header kosong, buat default
    if(headers.every(h=>!h)) headers = ['Tanggal','Status','Jumlah','Node/Pos','Kendala','Duration','RFO','LINK'];

    let data=[];
    for(let i=hIdx+1;i<lines.length;i++){
      let cols = splitCSV(lines[i]);
      if(cols.length<2) continue;
      let row={};
      headers.forEach((h,idx)=>{ row[h]=cols[idx]||''; });
      // Normalisasi
      let tgl = row['Tanggal']||row['TANGGAL']||row['tanggal']||cols[0]||'';
      let nodeRaw = row['Node/Pos']||row['NODE/POS']||row['Node']||cols[4]||cols[3]||'';
      if(!tgl && !nodeRaw) continue;

      // Pecah multiline "1. Pusdatin Duration: 14 jam RFO: ..."
      let parts = nodeRaw.split(/\n\s*(?=\d+\.\s)/);
      if(parts.length<=1) parts = [nodeRaw];

      parts.forEach(p=>{
        let clean = p.trim(); if(!clean) return;
        let nameMatch = clean.match(/^\d+\.\s*([^\n]+)/); 
        let name = nameMatch ? nameMatch[1].split('\n')[0].trim() : clean.split('\n')[0].trim().replace(/^\d+\.\s*/,'');
        name = name.replace(/^\d+[\.\)]\s*/,'').trim();
        if(name.length<2) return;
        let durMatch = clean.match(/Duration\s*:\s*([^\n]+)/i);
        let dur = durMatch ? durMatch[1].trim() : (row['Duration']||row['DURATION']||'');
        let rfoMatch = clean.match(/RFO\s*:\s*([\s\S]*?)(?=\n\s*\d+\.|$)/i);
        let rfo = rfoMatch ? rfoMatch[1].replace(/\n/g,' ').trim() : (row['RFO']||row['Kendala']||'');
        // Fallback untuk DTP format
        if(!dur) dur = row['Duration']||'';
        if(!rfo) rfo = row['RFO']||row['Kendala']||row['KENDALA']||'';

        data.push({
          Tanggal: tgl,
          "Node/Pos": name,
          Kendala: rfo || '-',
          Duration: dur || '-',
          RFO: rfo || '-',
          LINK: row['LINK']||row['Link']||row['link']||'Normal',
          STATUS: dur && dur!=='-' ? '3H+' : 'Bagus',
          is3HPlus: /[1-9]\d*\s*jam|[5-9]\d+\s*menit/.test(dur),
          _raw: clean
        });
      });
    }

    return res.json({data, total:data.length, gid, headers});
  }catch(e){
    return res.status(500).json({error:e.message, stack:e.stack, gid});
  }
}
