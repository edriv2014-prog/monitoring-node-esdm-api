function getProsesKey(node, kendala){
  const low=(kendala||'').toLowerCase();
  const km=(low.match(/(\d+[.,]?\d*\s*km)/)||[''])[0]||'';
  const pops=[...low.matchAll(/pop\s+([a-z0-9]+)/g)].map(m=>m[1]).join('-');
  const bireun=low.includes('bireun')&&low.includes('takengon')?'bireun-takengon':pops;
  return (km||bireun)? node+"||"+km+"||"+bireun : node+"||"+low.slice(0,50);
}
function splitPos(tx){
  if(!tx) return [];
  let txt=String(tx).trim();
  if(txt==='-'||txt.length<5) return [];
  let parts=txt.split(/(?=\d+\.\s)/).map(s=>s.trim()).filter(s=>s.length>5);
  let final=[];
  for(let p of parts){
    let subs=p.split(/\n\s*(?=(Pos PGA|Kampus Diklat|Tekmira|Ditjen|BBPMB|Balai|Pusat|Pusdatin|PSDM))/i);
    for(let s of subs){ s=s.trim(); if(s.length>10) final.push(s); }
  }
  return final.length?final:[txt];
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS') return res.status(200).end();
  try{
    const gid=req.query.gid||'285923348';
    let csvUrl=process.env.SHEET_CSV_URL||'';
    if(!csvUrl) throw new Error('SHEET_CSV_URL belum di-set di Vercel Env');
    if(csvUrl.includes('/edit')){
      const m=csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if(m) csvUrl=`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
    }
    if(!csvUrl.includes('gid=')) csvUrl+=(csvUrl.includes('?')?'&':'?')+`gid=${gid}&single=true`;
    const r=await fetch(csvUrl);
    if(!r.ok) throw new Error('fetch sheet '+r.status+' '+csvUrl);
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

    const rows=parseCSV(t);
    let rawOut=[];
    let lastTgl='';
    for(let i=1;i<rows.length;i++){
      const rr=rows[i];
      // FIX TANGGAL MERGE: kalau tgl kosong (image_a15a10.png), pakai tgl sebelumnya
      let tgl=(rr[0]||'').trim();
      if(!tgl) tgl=lastTgl; else lastTgl=tgl;
      if(!tgl) continue;

      // FIX KOLOM GESER: cari cell yang ada Duration / Pos PGA / RFO (bukan rr[5] hardcode)
      let kendalaCell='';
      for(let c=rr.length-1;c>=0;c--){
        const cell=rr[c]||'';
        if(cell.includes('Duration') || cell.includes('Pos PGA') || cell.includes('RFO') || cell.includes('PATGTL') || cell.includes('Tekmira')){
          kendalaCell=cell; break;
        }
      }
      if(!kendalaCell) kendalaCell=rr[4]||rr[5]||'';
      if(!kendalaCell) continue;

      const posList=splitPos(kendalaCell);
      for(const raw of posList){
        let cleanRaw=raw.replace(/^\s*\d+\.\s*/, '').trim();
        let firstLine=cleanRaw.split('\n')[0].trim();
        let node=firstLine.split(/Duration/i)[0].trim().replace(/\s+/g,' ').slice(0,120);
        if(node.length<3) continue;
        let kendalaBersih=raw.replace(/^\s*\d+\.\s*[^\n]*\n?/, '').trim();
        if(kendalaBersih.toLowerCase().startsWith(node.toLowerCase().slice(0,12))){
          kendalaBersih=kendalaBersih.slice(node.length).trim();
        }
        if(kendalaBersih.length<5) continue;
        const prosesKey=getProsesKey(node,kendalaBersih);
        rawOut.push({Tanggal:tgl, "Node/Pos":node, LINK:'Icon', KENDALA:kendalaBersih.slice(0,1200), _prosesKey:prosesKey});
      }
    }

    // gabung tanggal+node sama jadi 1 (06 Jul Soputan 2 durasi)
    const grouped={};
    for(let o of rawOut){
      const gkey=o.Tanggal+'||'+o["Node/Pos"];
      if(!grouped[gkey]) grouped[gkey]={...o, KENDALA:o.KENDALA};
      else grouped[gkey].KENDALA+='\n\n'+o.KENDALA;
    }
    let out=Object.values(grouped).map(o=>{const _key=o.Tanggal+'||'+o["Node/Pos"]+'||'+o._prosesKey; return {...o,_key};});

    const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const toDayKey=d=>{const m=d.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); return m? new Date(+m[3],bulan[m[2]]??0,+m[1]).toISOString().slice(0,10):null;};
    const parseTgl=s=>{const m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); return m? new Date(+m[3],bulan[m[2]]??0,+m[1]):new Date(0);};
    const map={}; out.forEach(o=>{const day=toDayKey(o.Tanggal); if(!day) return; if(!map[o._prosesKey]) map[o._prosesKey]=[]; map[o._prosesKey].push({...o,_day:day});});
    let result3H=[]; let nodes3H=new Set(); let keys3H=new Set();
    for(const k in map){
      const uniq=[...new Set(map[k].map(x=>x._day))].sort();
      if(uniq.length<3) continue;
      let streak=[uniq[0]];
      for(let i=1;i<=uniq.length;i++){
        const isLast=i===uniq.length; const diff=!isLast? (new Date(uniq[i])-new Date(uniq[i-1]))/86400000 : 999;
        if(!isLast && diff===1) streak.push(uniq[i]);
        else{ if(streak.length>=3){ map[k].forEach(row=>{ if(streak.includes(row._day)){ result3H.push(row); keys3H.add(row._key); nodes3H.add(row["Node/Pos"]); } }); } if(!isLast) streak=[uniq[i]]; }
      }
    }
    const clean=arr=>arr.map(({_day,_prosesKey,...r})=>r).sort((a,b)=> parseTgl(b.Tanggal)-parseTgl(a.Tanggal));
    return res.status(200).json({
      data: req.query.filter==='3hari'? clean(result3H):clean(out),
      total:out.length, total3H:result3H.length, totalTidak3H:out.length-result3H.length,
      count:req.query.filter==='3hari'?result3H.length:out.length, count3hari:nodes3H.size,
      nodes3hari:[...nodes3H], keys3hari:[...keys3H]
    });
  }catch(e){
    return res.status(200).json({data:[], total:0, total3H:0, totalTidak3H:0, count3hari:0, nodes3hari:[], keys3hari:[], error:e.message});
  }
}