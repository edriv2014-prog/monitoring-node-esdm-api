export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS') return res.status(200).end();
  const SHEET = process.env.SHEET_CSV_URL;
  if(!SHEET) return res.json({data:[], total:0, count3hari:0, nodes3hari:[], error:"SHEET_CSV_URL kosong di Vercel Env!"});

  try{
    const url = SHEET.includes('export?')? SHEET : SHEET;
    const r = await fetch(url);
    const csv = await r.text();
    if(csv.length<100) return res.json({data:[], total:0, count3hari:0, nodes3hari:[], error:"CSV kosong / sheet belum publish. Isi CSV: "+csv.slice(0,200)});

    const lines = csv.split('\n').filter(l=>l.trim());
    const parse = line=>{ let out=[],cur="",q=false; for(let c of line){ if(c=='"'){q=!q; continue} if(c==','&&!q){out.push(cur);cur="";}else cur+=c; } out.push(cur); return out; };
    const headers = parse(lines[0]).map(h=>h.replace(/"/g,'').trim());
    const idxTgl = headers.findIndex(h=>h.toLowerCase().includes('tanggal'));
    const idxNode = headers.findIndex(h=>h.toLowerCase().includes('node')||h.toLowerCase().includes('pos'));
    if(idxTgl==-1) return res.json({data:[], total:0, count3hari:0, nodes3hari:[], error:"Header tidak ada Tanggal. Header: "+headers.join(',')});

    let all = lines.slice(1).map(l=>{
      const v=parse(l); return {Tanggal:v[idxTgl]||"", "Node/Pos":v[idxNode]||"", LINK:v[headers.indexOf('LINK')]||"Icon", KENDALA:v[headers.indexOf('KENDALA')]||v.slice(-1)[0]||""};
    }).filter(o=>o.Tanggal && o["Node/Pos"]);

    const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const toDate=s=>{ const m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); return m? new Date(+m[3], bulan[m[2]]??0, +m[1]): null; };
    const byNode={}; all.forEach(o=>{ const k=o["Node/Pos"]; if(!byNode[k]) byNode[k]=[]; const dt=toDate(o.Tanggal); if(dt) byNode[k].push({...o,_date:dt}); });
    let threeRows=[], set=new Set();
    for(const n in byNode){
      const arr=byNode[n].sort((a,b)=>a._date-b._date);
      let s=[arr[0]];
      for(let i=1;i<arr.length;i++){ const d=(arr[i]._date-arr[i-1]._date)/86400000; if(d===1) s.push(arr[i]); else{ if(s.length>=3){ threeRows.push(...s); set.add(n);} s=[arr[i]]; } }
      if(s.length>=3){ threeRows.push(...s); set.add(n); }
    }
    const nodes3hari=[...set];
    threeRows=threeRows.map(({_date,...r})=>r);

    const filter=(req.query.filter||"").toLowerCase();
    if(filter==="3hari") return res.json({data:threeRows, total:all.length, count3hari:nodes3hari.length, count:threeRows.length, nodes3hari});
    return res.json({data:all, total:all.length, count3hari:nodes3hari.length, count:all.length, nodes3hari, data3hari:threeRows});
  }catch(e){ return res.json({data:[], total:0, count3hari:0, nodes3hari:[], error:e.message}); }
}