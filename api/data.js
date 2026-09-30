export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method==='OPTIONS') return res.status(200).end();

  const SHEET_CSV = process.env.SHEET_CSV_URL;
  if(!SHEET_CSV) return res.status(500).json({data:[], total:0, count3hari:0, nodes3hari:[]});

  const gid = req.query.gid || "285923348";
  const filter = (req.query.filter||"").toLowerCase();
  const url = SHEET_CSV.includes("gid=")? SHEET_CSV : `${SHEET_CSV}&gid=${gid}`;

  try{
    const r = await fetch(url);
    const csv = await r.text();
    const lines = csv.split("\n").filter(l=>l.trim());
    const parse = (line)=>{
      const out=[]; let cur=""; let inQ=false;
      for(let i=0;i<line.length;i++){
        const c=line[i];
        if(c=='"'){ inQ=!inQ; continue; }
        if(c==',' &&!inQ){ out.push(cur); cur=""; }
        else cur+=c;
      }
      out.push(cur); return out;
    };
    const headers = parse(lines[0]).map(h=>h.trim());
    let all = lines.slice(1).map(l=>{
      const vals=parse(l); const o={};
      headers.forEach((h,i)=> o[h]=vals[i]||"");
      return o;
    }).filter(o=> o["Tanggal"] && o["Node/Pos"]);

    // HITUNG 3H+
    const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const toDate=(s)=>{ const m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); if(!m) return null; return new Date(+m[3], bulan[m[2]]??0, +m[1]); };
    const byNode={};
    all.forEach(o=>{ const k=o["Node/Pos"]; if(!byNode[k]) byNode[k]=[]; const dt=toDate(o.Tanggal); if(dt) byNode[k].push({...o,_date:dt}); });
    let threeRows=[]; let nodesSet=new Set();
    for(const node in byNode){
      const items=byNode[node].sort((a,b)=>a._date-b._date);
      let streak=[items[0]];
      for(let i=1;i<items.length;i++){
        const diff=(items[i]._date-items[i-1]._date)/86400000;
        if(diff===1) streak.push(items[i]);
        else{ if(streak.length>=3){ threeRows.push(...streak); nodesSet.add(node); } streak=[items[i]]; }
      }
      if(streak.length>=3){ threeRows.push(...streak); nodesSet.add(node); }
    }
    const nodes3hari=[...nodesSet];
    threeRows = threeRows.map(({_date,...rest})=>rest).sort((a,b)=> toDate(b.Tanggal)-toDate(a.Tanggal));

    if(filter==="3hari"){
      return res.json({data: threeRows, total: all.length, count3hari: nodes3hari.length, count: threeRows.length, nodes3hari});
    }
    // default: balikin SEMUA + metadata
    return res.json({data: all, total: all.length, count3hari: nodes3hari.length, count: all.length, nodes3hari, data3hari: threeRows});
  }catch(e){
    return res.status(500).json({data:[], total:0, count3hari:0, nodes3hari:[], error:e.message});
  }
}
function parseCSV(t){ const rows=[]; let cur='',row=[],q=false; for(let i=0;i<t.length;i++){ let c=t[i],n=t[i+1]; if(c=='"'&&q&&n=='"'){cur+='"';i++;continue} if(c=='"'){q=!q;continue} if(c==','&&!q){row.push(cur);cur='';continue} if((c=='\n'||c=='\r')&&!q){ if(cur||row.length){row.push(cur);rows.push(row);row=[];cur=''} if(c=='\r'&&n=='\n') i++; continue } cur+=c; } if(cur||row.length){row.push(cur);rows.push(row)} return rows; }
function splitPos(text){ if(!text||String(text).trim()=='-') return []; const tt=String(text).trim(); if(tt.length<4) return []; return tt.split(/(?=\d+\.\s)/).map(s=>s.trim()).filter(s=>s.length>5); }