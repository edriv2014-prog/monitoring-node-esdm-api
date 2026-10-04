export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS') return res.status(200).end();
  try{
    const gid=req.query.gid||'285923348';
    let csvUrl=process.env.SHEET_CSV_URL||'';
    if(!csvUrl) throw new Error('SHEET_CSV_URL kosong');
    if(csvUrl.includes('/edit')){
      const m=csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if(m) csvUrl=`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
    }
    if(!csvUrl.includes('gid=')) csvUrl+=(csvUrl.includes('?')?'&':'?')+`gid=${gid}&single=true`;
    const r=await fetch(csvUrl); if(!r.ok) throw new Error('fetch '+r.status);
    const t=await r.text();
    function parseCSV(txt){
      const rows=[];let cur='',row=[],q=false;
      for(let i=0;i<txt.length;i++){
        let c=txt[i],n=txt[i+1];
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
    const getKey=(node,k)=>{
      const low=(k||'').toLowerCase();
      const km=(low.match(/(\d+[.,]?\d*\s*km)/)||[''])[0]||'';
      return km? node+'||'+km : node+'||'+low.slice(0,50);
    };
    // --- FIX 1: BULAN UTC ---
    const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const toDayKey=d=>{
      const mm=d.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
      if(!mm) return null;
      // PAKAI UTC BIAR 16 Sep ga jadi 15 Sep
      return new Date(Date.UTC(+mm[3], bulan[mm[2]]??0, +mm[1])).toISOString().slice(0,10);
    };
    const parseTgl=s=>{
      const mm=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
      return mm? new Date(Date.UTC(+mm[3], bulan[mm[2]]??0, +mm[1])):new Date(0);
    };
    const addDaysISO=(iso,days)=>{
      const dt=new Date(iso+'T00:00:00Z');
      dt.setUTCDate(dt.getUTCDate()+days);
      return dt.toISOString().slice(0,10);
    };

    for(let i=1;i<rows.length;i++){
      try{
        const rr=rows[i]; if(!rr) continue;
        // --- FIX 2: CARRY FORWARD MERGE A469:A475 ---
        let tgl=(rr[0]||'').trim();
        if(!tgl) tgl=lastTgl;
        else lastTgl=tgl;
        if(!tgl) continue;
        let bigCell='';
        for(let c=0;c<rr.length;c++){
          const cell=(rr[c]||'').trim();
          if(cell.length>bigCell.length && /(Duration|RFO)/i.test(cell)) bigCell=cell;
        }
        if(!bigCell) continue;
        const parts = bigCell.split(/\n\s*(?=\d+\.\s*(?:Pos|Gedung|BPH|PPSDM|Tekmira|BBPMB|Balai|PATGTL|PSDM|POP))/i)
                       .map(s=>s.trim()).filter(s=>s.length>15);
        const listToUse = parts.length? parts : [bigCell];
        for(const raw of listToUse){
          try{
            const lines = raw.split('\n').map(s=>s.trim()).filter(Boolean);
            if(!lines.length) continue;
            let first = lines[0].replace(/^\s*\d+\.\s*/,'').trim();
            if(!/(Pos|Gedung|BPH|PPSDM|Tekmira|BBPMB|Balai|PATGTL|PSDM|POP)/i.test(first)) continue;
            let nodeName = first.split(/Duration|RFO/i)[0].trim().replace(/^\s*\d+\.\s*/,'').trim();
            if(nodeName.length<3) continue;
            lastNode = nodeName;
            let kendala = raw.replace(/^\s*\d+\.\s*[^\n]*\n?/,'').trim();
            if(kendala.length<10) kendala = lines.slice(1).join('\n');
            let nodesToCreate=[nodeName];
            const mNode=nodeName.match(/(\d+)\s*node\s*\(([^)]+)\)/i);
            if(mNode) nodesToCreate=mNode[2].split(',').map(s=>s.trim().replace(/^\s*\d+\.\s*/,'')).filter(Boolean);
            for(let cur of nodesToCreate){
              cur = cur.replace(/^\s*\d+\.\s*/,'').trim();
              if(cur.length<3) continue;
              rawOut.push({Tanggal:tgl, "Node/Pos":cur, LINK:'Icon', KENDALA:kendala.slice(0,1200), _prosesKey:getKey(cur,kendala)});
            }
          }catch{}
        }
      }catch{}
    }
    const grouped={};
    for(let o of rawOut){
      const gkey=o.Tanggal+'||'+o["Node/Pos"];
      if(!grouped[gkey]) grouped[gkey]={...o, KENDALA:o.KENDALA};
      else grouped[gkey].KENDALA+='\n\n'+o.KENDALA;
    }
    let out=Object.values(grouped).map(o=>{const _key=o.Tanggal+'||'+o["Node/Pos"]+'||'+o._prosesKey; return {...o,_key};});

    // --- FIX 3: PATOKAN FILTER ---
    const patokanParam = (req.query.patokan||'').slice(0,10); // YYYY-MM-DD
    const map={};
    out.forEach(o=>{const day=toDayKey(o.Tanggal); if(!day) return; if(!map[o._prosesKey]) map[o._prosesKey]=[]; map[o._prosesKey].push({...o,_day:day});});

    //... logic 3H/7H/30H/90H tetap...
    let result3H=[], result7H=[], result30H=[], result90H=[];
    let nodes3H=new Set(), nodes7H=new Set(), nodes30H=new Set(), nodes90H=new Set();
    let keys3H=new Set(), keys7H=new Set(), keys30H=new Set(), keys90H=new Set();
    for(const k in map){
      const uniq=[...new Set(map[k].map(x=>x._day))].sort();
      if(!uniq.length) continue;
      let streak=[uniq[0]];
      for(let i=1;i<=uniq.length;i++){
        const isLast=i===uniq.length; const diff=!isLast? (new Date(uniq[i])-new Date(uniq[i-1]))/86400000 : 999;
        if(!isLast && diff===1) streak.push(uniq[i]);
        else{
          if(streak.length>=3) map[k].forEach(row=>{ if(streak.includes(row._day)&&!keys3H.has(row._key)){ result3H.push(row); keys3H.add(row._key); nodes3H.add(row["Node/Pos"]); } });
          if(streak.length>=7) map[k].forEach(row=>{ if(streak.includes(row._day)&&!keys7H.has(row._key)){ result7H.push(row); keys7H.add(row._key); nodes7H.add(row["Node/Pos"]); } });
          if(streak.length>=30) map[k].forEach(row=>{ if(streak.includes(row._day)&&!keys30H.has(row._key)){ result30H.push(row); keys30H.add(row._key); nodes30H.add(row["Node/Pos"]); } });
          if(streak.length>=90) map[k].forEach(row=>{ if(streak.includes(row._day)&&!keys90H.has(row._key)){ result90H.push(row); keys90H.add(row._key); nodes90H.add(row["Node/Pos"]); } });
          if(!isLast) streak=[uniq[i]];
        }
      }
    }
    for(let o of out){
      try{
        if(/saat ini/i.test(o.KENDALA)){
          const m=o.KENDALA.match(/Tgl\s*(\d{1,2})\/(\d{2,4})/);
          if(m){
            const year = m[2].length==2? +('20'+m[2]) : +m[2];
            const start=new Date(Date.UTC(year,+m[1]-1,1));
            const rep=toDayKey(o.Tanggal); if(!rep) continue;
            const diff=(new Date(rep)-start)/86400000;
            if(diff>=2 &&!keys3H.has(o._key)){ result3H.push(o); keys3H.add(o._key); nodes3H.add(o["Node/Pos"]); }
            if(diff>=6 &&!keys7H.has(o._key)){ result7H.push(o); keys7H.add(o._key); nodes7H.add(o["Node/Pos"]); }
            if(diff>=29 &&!keys30H.has(o._key)){ result30H.push(o); keys30H.add(o._key); nodes30H.add(o["Node/Pos"]); }
            if(diff>=89 &&!keys90H.has(o._key)){ result90H.push(o); keys90H.add(o._key); nodes90H.add(o["Node/Pos"]); }
          }
        }
      }catch{}
    }
    const potonganMap={}; for(const k in map){ const s=map[k].sort((a,b)=> new Date(a._day)-new Date(b._day)); if(s[0]&&!potonganMap[k]) potonganMap[k]=s[0]; }
    const resultPotongan=Object.values(potonganMap);

    // --- FIX 4: CLEAN + FILTER PATOKAN INCLUSIVE ---
    const clean=arr=>arr.map(({_day,_prosesKey,...r})=>r).sort((a,b)=> parseTgl(b.Tanggal)-parseTgl(a.Tanggal));
    const cleanAsc=arr=>arr.map(({_day,_prosesKey,...r})=>r).sort((a,b)=> parseTgl(a.Tanggal)-parseTgl(b.Tanggal));

    const filter=req.query.filter||'semua';
    let dataToReturn=clean(out);

    // Jika ada?patokan=2026-09-16 maka filter h