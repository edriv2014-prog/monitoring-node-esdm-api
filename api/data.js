function getProsesKey(node, kendala){
  try{
    const low = (kendala||'').toLowerCase();
    const kmM = low.match(/(\d+[.,]?\d*\s*km)/);
    const km = kmM? kmM[0].replace(',','.') : '';
    const pops = [...low.matchAll(/pop\s+([a-z0-9]+)/g)].map(m=>m[1]).join('-');
    const bireun = (low.includes('bireun') && low.includes('takengon'))? 'bireun-takengon' : pops;
    if(!km &&!bireun){
      let rfo = (low.split('rfo')[1]||low).slice(0,50);
      return node+"||"+rfo;
    }
    return node+"||"+km+"||"+bireun;
  }catch{ return node; }
}

function splitPos(tx){
  if(!tx) return [];
  let txt = String(tx).trim();
  if(txt=='-'||txt.length<5) return [];
  // 1. split pakai nomor 1. 2.
  let byNumber = txt.split(/(?=\d+\.\s)/).map(s=>s.trim()).filter(s=>s.length>5);
  if(byNumber.length>1) txt = byNumber.join('\n---SPLIT---\n');
  let parts = txt.split('---SPLIT---');
  let final=[];
  for(let p of parts){
    // 2. split tanpa nomor: kalau dalam 1 cell ada 6 node kayak 05 Jul Pos PGA Soputan, Seulawah Agam, Kampus...
    // image_914f50.png
    let subs = p.split(/\n\s*(?=(Pos PGA|Kampus Diklat|Tekmira|Ditjen|BBPMB|Balai|Pusat|Pusdatin|PSDM))/i);
    for(let s of subs){
      s=s.trim();
      if(s.length>10) final.push(s);
    }
  }
  return final.length? final : [txt];
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS') return res.status(200).end();
  try{
    const gid=req.query.gid||'285923348';
    let csvUrl=process.env.SHEET_CSV_URL||"";
    if(csvUrl && csvUrl.includes('/edit')){
      const mm=csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if(mm) csvUrl=`https://docs.google.com/spreadsheets/d/${mm[1]}/export?format=csv&gid=${gid}`;
    }
    if(!csvUrl) csvUrl=`https://docs.google.com/spreadsheets/d/1placeholder/export?format=csv&gid=${gid}`;
    if(!csvUrl.includes('gid=')) csvUrl+=(csvUrl.includes('?')?'&':'?')+`gid=${gid}&single=true`;
    const r=await fetch(csvUrl); if(!r.ok) throw new Error('sheet fetch '+r.status);
    const t=await r.text();
    function parseCSV(t){
      const rows=[]; let cur='',row=[],q=false;
      for(let i=0;i<t.length;i++){
        let c=t[i],n=t[i+1];
        if(c=='"'&&q&&n=='"'){cur+='"';i++;continue}
        if(c=='"'){q=!q;continue}
        if(c==','&&!q){row.push(cur);cur='';continue}
        if((c=='\n'||c=='\r')&&!q){
          if(cur||row.length){row.push(cur);rows.push(row);row=[];cur=''}
          if(c=='\r'&&n=='\n') i++; continue
        }
        cur+=c;
      }
      if(cur||row.length){row.push(cur);rows.push(row)}
      return rows;
    }
    const rows=parseCSV(t); let rawOut=[];
    for(let i=1;i<rows.length;i++){
      const rr=rows[i]; const tgl=(rr[0]||'').trim(); if(!tgl) continue;
      const cell=rr[5]||'';
      const posList=splitPos(cell);
      for(const raw of posList){
        try{
          let cleanRaw = raw.replace(/^\s*\d+\.\s*/, '').trim();
          let firstLine = cleanRaw.split('\n')[0].trim();
          let node = firstLine.split(/Duration/i)[0].trim().replace(/\s+/g,' ').slice(0,120);
          if(node.length<3) continue;
          // KENDALA tanpa nourut & tanpa node
          let kendalaBersih = raw.replace(/^\s*\d+\.\s*[^\n]*\n?/, '').trim();
          if(kendalaBersih.toLowerCase().startsWith(node.toLowerCase().slice(0,10))){
            kendalaBersih = kendalaBersih.slice(node.length).trim();
          }
          if(kendalaBersih.length<5) continue;
          const prosesKey=getProsesKey(node,kendalaBersih);
          rawOut.push({Tanggal:tgl, "Node/Pos":node, LINK:'Icon', KENDALA:kendalaBersih.slice(0,1200), _prosesKey:prosesKey});
        }catch{}
      }
    }
    // gabung tanggal+node sama jadi 1 (06 Jul Soputan 2 durasi jadi 1)
    const grouped={};
    for(let o of rawOut){
      const gkey=o.Tanggal+'||'+o["Node/Pos"];
      if(!grouped[gkey]) grouped[gkey]={...o, KENDALA:o.KENDALA, _prosesKey:o._prosesKey};
      else grouped[gkey].KENDALA += '\n\n'+o.KENDALA;
    }
    let out=Object.values(grouped).map(o=>{ const _key=o.Tanggal+'||'+o["Node/Pos"]+'||'+o._prosesKey; return {...o, _key}; });

    const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const toDayKey=d=>{ const m=d.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); return m? new Date(+m[3],bulan[m[2]]??0,+m[1]).toISOString().slice(0,10):null; };
    const parseTgl=s=>{ const m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); return m? new Date(+m[3],bulan[m[2]]??0,+m[1]):new Date(0); };
    const map={}; out.forEach(o=>{ const day=toDayKey(o.Tanggal); if(!day) return; if(!map[o._prosesKey]) map[o._prosesKey]=[]; map[o._prosesKey].push({...o,_day:day}); });
    let result3H=[]; let nodes3H=new Set(); let keys3H=new Set();
    for(const k in map){
      const uniq=[...new Set(map[k].map(x=>x._day))].sort();
      if(uniq.length<3) continue; // 2H gak masuk
      let streak=[uniq[0]];
      for(let i=1;i<=uniq.length;i++){
        const isLast=i===uniq.length; const diff=!isLast? (new Date(uniq[i])-new Date(uniq[i-1]))/86400000 : 999;
        if(!isLast && diff===1) streak.push(uniq[i]);
        else{ if(streak.length>=3){ map[k].forEach(row=>{ if(streak.includes(row._day)){ result3H.push(row); keys3H.add(row._key); nodes3H.add(row["Node/Pos"]); } }); } if(!isLast) streak=[uniq[i]]; }
      }
    }
    const clean=arr=>arr.map(({_day,_prosesKey,...r})=>r).sort((a,b)=> parseTgl(b.Tanggal)-parseTgl(a.Tanggal));
    return res.status(200).json({
      data: req.query.filter==='3hari'? clean(result3H) : clean(out),
      total: out.length, total3H: result3H.length, totalTidak3H: out.length-result3H.length,
      count: req.query.filter==='3hari'? result3H.length : out.length, count3hari: nodes3H.size,
      nodes3hari:[...nodes3H], keys3hari:[...keys3H]
    });
  }catch(e){
    return res.status(200).json({data:[], total:0, total3H:0, totalTidak3H:0, count3hari:0, nodes3hari:[], keys3hari:[], error:e.message});
  }
}