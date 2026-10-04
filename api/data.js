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
    let rawOut=[]; let lastTgl='';
    const getKey=(node,k)=>{
      const low=(k||'').toLowerCase();
      const km=(low.match(/(\d+[.,]?\d*\s*km)/)||[''])[0]||'';
      return km? node+'||'+km : node+'||'+low.slice(0,50);
    };

    for(let i=1;i<rows.length;i++){
      try{
        const rr=rows[i]; if(!rr) continue;
        let tgl=(rr[0]||'').trim();
        // FIX MERGE: kalau kosong pakai tanggal sebelumnya (A469:A475)
        if(!tgl) tgl=lastTgl; else lastTgl=tgl;
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
            if(!/(Pos|Gedung|BPH|PPSDM|Tekmira|BBPMB|Balai|PATGTL|PSDM|POP)/i.test(first)){
              continue;
            }
            let nodeName = first.split(/Duration|RFO/i)[0].trim().replace(/^\s*\d+\.\s*/,'').trim();
            if(nodeName.length<3) continue;
            let kendala = raw.replace(/^\s*\d+\.\s*[^\n]*\n?/,'').trim();
            if(kendala.length<10) kendala = lines.slice(1).join('\n');

            let nodesToCreate=[nodeName];
            const mNode=nodeName.match(/(\d+)\s*node\s*\(([^)]+)\)/i);
            if(mNode) nodesToCreate=mNode[2].split(',').map(s=>s.trim().replace(/^\s*\d+\.\s*/,'')).filter(Boolean);

            for(let cur of nodesToCreate){
              cur = cur.replace(/^\s*\d+\.\s*/,'').trim();
              if(cur.length<3) continue;
              rawOut.push({Tanggal:tgl, "Node/Pos":cur, LINK:'Icon', KENDALA:kendala.slice(0,