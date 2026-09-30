export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS') return res.status(200).end();
  try{
    const gid=req.query.gid||'285923348';
    let csvUrl=process.env.SHEET_CSV_URL||"";
    if(!csvUrl) return res.json({data:[], total:0, count:0, count3hari:0, nodes3hari:[]});
    if(csvUrl.includes('/edit')){
      const m=csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if(m) csvUrl=`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
    }
    if(!csvUrl.includes('gid=')) csvUrl+=(csvUrl.includes('?')?'&':'?')+`gid=${gid}&single=true`;
    const r=await fetch(csvUrl); const t=await r.text();
    if(t.includes('<html')) return res.json({data:[], total:0, count:0, count3hari:0, nodes3hari:[], error:"Sheet belum Publish"});

    function parseCSV(t){ const rows=[]; let cur='',row=[],q=false; for(let i=0;i<t.length;i++){ let c=t[i],n=t[i+1]; if(c=='"'&&q&&n=='"'){cur+='"';i++;continue} if(c=='"'){q=!q;continue} if(c==','&&!q){row.push(cur);cur='';continue} if((c=='\n'||c=='\r')&&!q){ if(cur||row.length){row.push(cur);rows.push(row);row=[];cur=''} if(c=='\r'&&n=='\n') i++; continue } cur+=c; } if(cur||row.length){row.push(cur);rows.push(row)} return rows; }
    function splitPos(text){ if(!text||String(text).trim()=='-') return []; return String(text).trim().split(/(?=\d+\.\s)/).map(s=>s.trim()).filter(s=>s.length>5); }

    const rows=parseCSV(t); let out=[];
    for(let i=1;i<rows.length;i++){
      const rr=rows[i]; if(!rr) continue;
      const tgl=(rr[0]||'').trim(); if(!tgl) continue;
      const posList=splitPos(rr[5]);
      for(const raw of posList){
        let m=raw.match(/^\d+\.\s*([^\n]+)/); let node=m? m[1]: raw.split('\n')[0];
        node=node.split(/Duration/i)[0].trim().replace(/\s+/g,' ').slice(0,120);
        if(node.length<3) continue;
        out.push({Tanggal:tgl, "Node/Pos":node, LINK:'Icon', KENDALA:raw.slice(0,800)});
      }
    }

    const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const toDayKey=d=>{ const m=d.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); if(!m) return null; return new Date(+m[3],bulan[m[2]]??0,+m[1]).toISOString().slice(0,10); };
    const parseTgl=s=>{ const m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); return m? new Date(+m[3],bulan[m[2]]??0,+m[1]) : new Date(0); };
    out.sort((a,b)=> parseTgl(b.Tanggal)-parseTgl(a.Tanggal));

    // === FIX UTAMA: HITUNG HARI UNIK, BUKAN BARIS ===
    const map={};
    out.forEach(o=>{
      const day=toDayKey(o.Tanggal); if(!day) return;
      if(!map[o["Node/Pos"]]) map[o["Node/Pos"]]=[];
      map[o["Node/Pos"]].push({...o, _day:day});
    });

    let result3H=[];
    let nodes3H=new Set();

    for(const node in map){
      const uniqueDays=[...new Set(map[node].map(x=>x._day))].sort(); // 27 Sep, 26 Sep = 2 hari doang
      if(uniqueDays.length<3) continue; // langsung skip kalau harinya cuma 2

      let streak=[uniqueDays[0]];
      for(let i=1;i<=uniqueDays.length;i++){
        const isLast=i===uniqueDays.length;
        const diff=!isLast? (new Date(uniqueDays[i])-new Date(uniqueDays[i-1]))/86400000 : 999;
        if(!isLast && diff===1){
          streak.push(uniqueDays[i]);
        }else{
          if(streak.length>=3){ // baru 3H+ kalau harinya 3 berturut
            streak.forEach(d=>{
              map[node].filter(x=>x._day===d).forEach(r=>result3H.push(r));
            });
            nodes3H.add(node);
          }
          if(!isLast) streak=[uniqueDays[i]];
        }
      }
    }

    const clean=arr=>arr.map(({_day,...r})=>r);
    const total=out.length;
    const total3H=result3H.length;
    const totalTidak3H=total-total3H;

    return res.json({
      data: req.query.filter==='3hari'? clean(result3H) : clean(out),
      count: req.query.filter==='3hari'? total3H : total,
      total: total,
      total3H: total3H,
      totalTidak3H: totalTidak3H,
      count3hari: nodes3H.size,
      nodes3hari:[...nodes3H],
      summary: `Total ${total} | Tidak 3H+ Bagus ${totalTidak3H} | 3H+ Protes ${total3H} baris / ${nodes3H.size} Node`
    });
  }catch(e){ return res.json({data:[], total:0, count:0, count3hari:0, nodes3hari:[], error:e.message}); }
}