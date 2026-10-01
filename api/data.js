function getProsesKey(node,kendala){
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
    let subs=p.split(/\n\s*(?=(Pos PGA|Kampus Diklat|Tekmira|Ditjen|BBPMB|Balai|Pusat|Pusdatin|PSDM|PATGTL))/i);
    for(let s of subs){ s=s.trim(); if(s.length>10) final.push(s); }
  }
  return final.length?final:[txt];
}
// hitung selisih hari dari Duration Tgl 10/09/2026 14.50 - saat ini
function isLongDuration(tglLaporan, kendala){
  try{
    const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const parseTglLaporan=s=>{const m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); return m? new Date(+m[3],bulan[m[2]]??0,+m[1]):null;};
    const laporanDate=parseTglLaporan(tglLaporan);
    if(!laporanDate) return false;
    if(!/saat ini/i.test(kendala)) return false;
    // cari semua Tgl 10/09/2026 atau 27/8/2026
    const re=/Tgl\s*(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{4})\s+\d{1,2}[.:]\d{2}/gi;
    let m; let minStart=null;
    while((m=re.exec(kendala))!==null){
      let d,mn,y;
      if(m[1]){ d=+m[1]; mn=+m[2]-1; y=+m[3]; }
      else { d=+m[4]; mn=+m[5]-1; y=+m[6]; }
      const start=new Date(y,mn,d);
      if(!minStart || start<minStart) minStart=start;
    }
    if(!minStart) return false;
    const diff=(laporanDate - minStart)/86400000;
    return diff>=2; // 10 Sep -> 13 Sep = 3 hari => 3H+
  }catch{ return false; }
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS') return res.status(200).end();
  try{
    const gid=req.query.gid||'285923348';
    let csvUrl=process.env.SHEET_CSV_URL||'';
    if(!csvUrl) throw new Error('SHEET_CSV_URL kosong');
    if(csvUrl.includes('/edit')){
      const mm=csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if(mm) csvUrl=`https://docs.google.com/spreadsheets/d/${mm[1]}/export?format=csv&gid=${gid}`;
    }
    if(!csvUrl.includes('gid=')) csvUrl+=(csvUrl.includes('?')?'&':'?')+`gid=${gid}&single=true`;
    const r=await fetch(csvUrl); if(!r.ok) throw new Error('fetch '+r.status);
    const t=await r.text();
    function parseCSV(t){const rows=[];let cur='',row=[],q=false;for(let i=0;i<t.length;i++){let c=t[i],n=t[i+1];if(c=='"'&&q&&n=='"'){cur+='"';i++;continue}if(c=='"'){q=!q;continue}if(c==','&&!q){row.push(cur);cur='';continue}if((c=='\n'||c=='\r')&&!q){if(cur||row.length){row.push(cur);rows.push(row);row=[];cur=''}if(c=='\r'&&n=='\n') i++;continue}cur+=c;}if(cur||row.length){row.push(cur);rows.push(row)}return rows;}
    const rows=parseCSV(t);
    let rawOut=[]; let lastTgl='', lastNode='';
    for(let i=1;i<rows.length;i++){
      const rr=rows[i];
      let tgl=(rr[0]||'').trim(); if(!tgl) tgl=lastTgl; else lastTgl=tgl; if(!tgl) continue;
      let nodeCell='', kendalaCell='';
      for(let c=0;c<rr.length;c++){
        const cell=(rr[c]||'').trim(); if(!cell) continue;
        if(/(Pos PGA|PATGTL|Tekmira|PSDM|Pusdatin|BBPMB|Balai|node\s*\()/i.test(cell) &&!/Duration|RFO\s*:/i.test(cell) && cell.length<200){
          let cleanNode=cell.replace(/^\s*\d+\.\s*/, '').trim(); // hapus 1. 2. (image_b4aa6c.png)
          if(cleanNode.length>nodeCell.length) nodeCell=cleanNode;
        }
        if(/(Duration|RFO\s*:|km dari|POP|Masih dalam proses)/i.test(cell) && cell.length>10){
          if(cell.length>kendalaCell.length) kendalaCell=cell;
        }
      }
      if(nodeCell) lastNode=nodeCell;
      let node=nodeCell||lastNode||'';
      if(!kendalaCell){
        for(let c=0;c<rr.length;c++){const cell=(rr[c]||'').trim(); if(/Pos PGA.*Duration/i.test(cell)){kendalaCell=cell; break;}}
      }
      if(!kendalaCell) continue;
      if(!node){
        const m=kendalaCell.match(/(Pos PGA[^\n]*|PATGTL[^\n]*|Tekmira[^\n]*|PSDM[^\n]*)/i);
        if(m){ node=m[1].split(/Duration|RFO/i)[0].trim(); lastNode=node; } else node=lastNode||'Unknown';
      }
      // FIX 3 NODE (PPSDM Geominerba, Tekmira Bandung, PEP Bandung) -> split jadi 3
      let nodesToCreate=[node];
      const mNode=node.match(/(\d+)\s*node\s*\(([^)]+)\)/i);
      if(mNode){
        nodesToCreate=mNode[2].split(',').map(s=>s.trim().replace(/^\d+\.\s*/,'')).filter(Boolean);
      } else if(node.toLowerCase().includes('3 node')){
        const inside=node.match(/\(([^)]+)\)/);
        if(inside) nodesToCreate=inside[1].split(',').map(s=>s.trim().replace(/^\d+\.\s*/,'')).filter(Boolean);
      }

      const posList=splitPos(kendalaCell);
      const listToUse=posList.length?posList:[kendalaCell];
      for(let curNodeName of nodesToCreate){
        curNodeName=curNodeName.replace(/^\s*\d+\.\s*/, '').trim(); // hapus nourut
        for(const raw of listToUse){
          let firstLine=raw.replace(/^\s*\d+\.\s*/,'').split('\n')[0].trim();
          let curNode=curNodeName;
          if(/(Pos PGA|PATGTL|Tekmira|PSDM)/i.test(firstLine) &&!/^\d+\s*node/i.test(firstLine)){
            const extracted=firstLine.split(/Duration|RFO/i)[0].trim().replace(/\s+/g,' ').slice(0,120).replace(/^\s*\d+\.\s*/,'');
            if(extracted) curNode=extracted;
          }
          let kendalaBersih=raw.replace(/^\s*\d+\.\s*[^\n]*\n?/, '').trim();
          if(curNode && kendalaBersih.toLowerCase().startsWith(curNode.toLowerCase().slice(0,12))){
            kendalaBersih=kendalaBersih.slice(curNode.length).trim();
          }
          if(kendalaBersih.length<5) continue;
          const prosesKey=getProsesKey(curNode,kendalaBersih);
          rawOut.push({Tanggal:tgl, "Node/Pos":curNode, LINK:'Icon', KENDALA:kendalaBersih.slice(0,1200), _prosesKey:prosesKey});
        }
      }
    }
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
    // 1. yang 3 hari berurutan
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
    // 2. yang Duration Tgl 10/09/2026 - saat ini sampai 13 Sep (kasus kamu)
    for(let o of out){
      if(isLongDuration(o.Tanggal, o.KENDALA)){
        if(!keys3H.has(o._key)){ result3H.push(o); keys3H.add(o._key); nodes3H.add(o["Node/Pos"]); }
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