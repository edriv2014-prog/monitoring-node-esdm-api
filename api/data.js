export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  const gid = req.query.gid || '0';
  const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1D2k6V8u1R9x...'; // GANTI DENGAN ID SHEET ASLI KAMU
  try{
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
    const r = await fetch(csvUrl);
    const txt = await r.text();
    if(txt.includes('<!DOCTYPE')) throw new Error('Sheet belum Public! Set Share -> Anyone with link Viewer');
    const lines = txt.split(/\n/).filter(Boolean);
    if(!lines[0]) throw new Error('CSV kosong gid='+gid);
    // ANTI ERROR SPLIT - kalau header gak ketemu pakai baris pertama
    let hIdx = lines.findIndex(l=>/tanggal/i.test(l));
    if(hIdx===-1) hIdx=0;
    const header = lines[hIdx] || lines[0];
    const splitCSV = (s)=>{ let o=[],c='',q=false; for(let ch of s){ if(ch=='"') q=!q; else if(ch==','&&!q){ o.push(c); c=''; } else c+=ch; } o.push(c); return o; };
    const headers = splitCSV(header);
    let data=[];
    for(let i=hIdx+1;i<lines.length;i++){
      let cols=splitCSV(lines[i]);
      let tgl=cols[0]||''; let node=cols[4]||cols[3]||'';
      if(!tgl) continue;
      // Pecah multiline 1. 2. 3.
      let parts = node.split(/\n(?=\d+\.)/);
      if(parts.length==1) parts=[node];
      parts.forEach(p=>{
        let dur = (p.match(/Duration\s*:\s*([^\n]+)/i)?.[1]||'').trim();
        let rfo = (p.match(/RFO\s*:\s*([^\n]+)/i)?.[1]||'').trim();
        let name = p.split('\n')[0].replace(/^\d+\.\s*/,'').trim();
        if(name) data.push({Tanggal:tgl, "Node/Pos":name, Duration:dur||'-', RFO:rfo||'-', Kendala:rfo||dur, LINK:'Normal', is3HPlus:/[1-9]\s*jam/.test(dur)});
      });
    }
    res.json({data, total:data.length});
  }catch(e){ res.status(500).json({error:e.message, gid:req.query.gid}); }
}