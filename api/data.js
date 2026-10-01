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
function isLongDuration(tglLaporan, kendala){
  try{
    const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const parseTglLaporan=s=>{const m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); return m? new Date(+m[3],bulan[m[2]]??0,+m[1]):null;};
    const laporanDate=parseTglLaporan(tglLaporan);
    if(!laporanDate) return false;
    if(!/saat ini/i.test(kendala)) return false;
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
    return diff>=2;
  }catch{ return false; }
}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS') return res.status(200).end();
  try{
    const gid=req.query.gid||'285923348';
    let csvUrl=process.env.SHEET_CSV_URL||'';
    if(!csvUrl) throw new Error('SHEET_CSV_URL kosong di Vercel Env');
    if(csvUrl.includes('/edit')){
      const mm=csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if(mm) csvUrl=`https://docs.google.com/spreadsheets/d/${mm[1]}/export?format=csv&gid=${gid}`;
    }
    if(!csvUrl.includes('gid=')) csvUrl+=(csvUrl.includes('?')?'&':'?')+`gid=${gid}&single=true`;
    const r=await fetch(csvUrl); if(!r.ok) throw new Error('fetch '+r.status);
    const t=await r.text();
    function parseCSV(t){
      const rows=[];let cur='',row=[],q=false;
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
    let rawOut=[]; let lastTgl='', lastNode='';
    for(let i=1;i<rows.length;i++){
      const rr=rows[i];
      let tgl=(rr[0]||'').trim();
      if(!tgl) tgl=lastTgl; else lastTgl=tgl;
      if(!tgl) continue;

      let nodeCell='', kendalaCell='';
      for(let c=0;c<rr.length;c++){
        const cell=(rr[c]||'').trim(); if(!cell) continue;
        if(/(Pos PGA|PATGTL|Tekmira|PSDM|Pusdatin|BBPMB|Balai|node\s*\()/i.test(cell) &&!/Duration|RFO\s*:/i.test(cell) && cell.length<200){
          let cleanNode=cell.replace(/^\s*\d+\.\s*/, '').trim();
          if(cleanNode.length>nodeCell.length) nodeCell=cleanNode;
        }
        if(/(Duration|RFO\s*:|km dari|POP|Masih dalam proses)/i.test(cell) && cell.length>10){
          if(cell.length>kendalaCell.length) kendalaCell=cell;
        }
      }
      if(nodeCell) lastNode=nodeCell;
      let node=nodeCell||lastNode||'';
      if(!kendalaCell){
        for(let c=0;c<rr.length;c++){
          const cell=(rr[c]||'').trim();
          if(/Pos PGA.*Duration/i.test(cell)){ kendalaCell=cell; break; }
        }
      }
      if(!kendalaCell) continue;
      if(!node){
        const m=kendalaCell.match(/(Pos PGA[^\n]*|PATGTL[^\n]*|Tekmira[^\n]*|PSDM[^\n]*)/i);
        if(m){ node=m[1].split(/Duration|RFO/i)[0].trim().replace(/^\s*\d+\.\s*/,''); lastNode=node; }
        else node=lastNode||'Unknown';
      }

      let nodesToCreate=[node];
      const mNode=node.match(/(\d+)\s*node\s*\(([^)]+)\)/i);
      if(mNode){
        nodesToCreate=mNode[2].split(',').map(s=>s.trim().replace(/^\s*\d+\.\s*/,'')).filter(Boolean);
      }else if(node.toLowerCase().includes('node') && node.includes('(')){
        const inside=node.match(/\(([^)]+)\)/);
        if(inside) nodesToCreate=inside[1].split(',').map(s=>s.trim().replace(/^\s*\d+\.\s*/,'')).filter(Boolean);
      }

      const posList=splitPos(kendalaCell);
      const listToUse=posList.length?posList:[kendalaCell];
      for(let curNodeName of nodesToCreate){
        curNodeName=curNodeName.replace(/^\s*\d+\.\s*/, '').trim();
        for(const raw of listToUse){
          let firstLine=raw.replace(/^\s*\d+\.\s*/,'').split('\n')[0].trim();
          let curNode=curNodeName;
          if(/(Pos PGA|PATGTL|Tekmira|PSDM|BBPMB)/i.test(firstLine) &&!/^\d+\s*node/i.test(firstLine)){
            const extracted=firstLine.split(/Duration|RFO/i)[0].trim().replace(/\s+/g,' ').slice(0,120).replace(/^\s*\d+\.\s*/,'');
            if(extracted && extracted.length>2) curNode=extracted;
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
    const toDayKey=d=>{const m=d.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); return m? new Date(+m[3],bulan[m[2]]??