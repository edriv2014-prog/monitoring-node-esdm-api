export default async function handler(req, res) {
  const baseURL = process.env.SHEET_CSV_URL || "https://docs.google.com/spreadsheets/d/e/2PACX-1vRs7guoNrzRDNg8bP5epCOXStLlQsd9Ba8hPLweqQELJ5i0e-oEa6KRV1UYZpkvDJLOq8-XtVMn5hls/pub?output=csv";
  // FIX 1: Baca gid dari URL
  const gid = req.query.gid || '0';
  const SHEET_CSV_URL = `${baseURL.split('/pub')[0]}/pub?gid=${gid}&single=true&output=csv&cb=${Date.now()}`;

  const cleanNode = (s) => {
    let v = String(s||'');
    v = v.replace(/^\s*[\d\.\-\)\:\s\u00A0\xA0]+/g, '').trim();
    v = v.replace(/^\d+\W+/g, '').trim();
    const m = v.match(/[A-Za-z].*/s);
    return m? m[0].split('\n')[0].trim() : v.split('\n')[0].trim();
  };

  function parseCSV(text) {
    const rows=[]; let curRow=[], curCol='', inQuote=false;
    for(let i=0;i<text.length;i++){
      const c=text[i], next=text[i+1];
      if(c==='"'){ if(inQuote && next==='"'){ curCol+='"'; i++; } else inQuote=!inQuote; }
      else if(c===',' &&!inQuote){ curRow.push(curCol); curCol=''; }
      else if((c==='\n'||c==='\r') &&!inQuote){
        if(curCol||curRow.length){ curRow.push(curCol); rows.push(curRow); curRow=[]; curCol=''; }
        if(c==='\r' && next==='\n') i++;
      } else curCol+=c;
    }
    if(curCol||curRow.length){ curRow.push(curCol); rows.push(curRow); }
    return rows;
  }

  try{
    const r = await fetch(SHEET_CSV_URL);
    const text = await r.text();
    const rows = parseCSV(text);
    const allData=[];

    for(let ri=4; ri<rows.length; ri++){
      const cols=rows[ri];
      if(!cols||cols.length<5) continue;
      const tanggal=(cols[0]||'').trim();
      const icon=(cols[1]||'').trim()||'Normal';
      const detail=(cols[4]||'').trim();
      if(!tanggal||!detail) continue;
      if(!/Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des/i.test(tanggal)) continue;

      // FIX 2: Split cuma butuh \n + angka, gak harus \n\n
      const entries=detail.split(/\n\s*(?=\d+\.\s)/g);

      for(const entry of entries){
        if(!entry.trim()) continue;
        const lines=entry.trim().split('\n').map(l=>l.trim()).filter(Boolean);
        if(!lines.length) continue;
        let nodeRaw=lines[0];
        const durationLine=lines.find(l=>/Duration\s*:/i.test(l))||'';
        const rfoIdx=lines.findIndex(l=>/RFO\s*:/i.test(l));
        let rfo=''; if(rfoIdx>=0) rfo=lines.slice(rfoIdx).join(' ').replace(/RFO\s*:\s*/i,'').trim();
        let duration=''; const m=durationLine.match(/Duration\s*:\s*(.*)/i); if(m) duration=m[1].trim();

        // FIX 3: Fallback kalau Duration masih kosong, cari manual
        if(!duration){
          const raw = entry.match(/Duration\s*:\s*([^\n]+)/i);
          if(raw) duration = raw[1].trim();
        }

        const node=cleanNode(nodeRaw);
        if(!node) continue;
        allData.push({ Tanggal:tanggal, "Node/Pos":node, NodeRaw:nodeRaw, LINK:icon, KENDALA:`Duration : ${duration||'-'} RFO : ${rfo||'-'}`, Duration:duration||'', RFO:rfo||'' });
      }
    }

    // === FIX 3H+ REAL - HANYA 3 HARI KALENDER BERTURUT-TURUT (punya kamu tetap) ===
    const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const toDate=(s)=>{ const m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); return m? new Date(+m[3], bulan[m[2]]??0, +m[1]): null; };
    const toKey=(d)=> d.toISOString().slice(0,10);
    const byNode={};
    allData.forEach((o,idx)=>{ const k=cleanNode(o["Node/Pos"]).toLowerCase(); if(!byNode[k]) byNode[k]=[]; byNode[k].push({idx, date:toDate(o.Tanggal)}); });
    const idxYang3H = new Set();
    Object.values(byNode).forEach(arr=>{
      const uniqMap={};
      arr.forEach(a=>{ if(a.date){ uniqMap[toKey(a.date)]=a.date; } });
      const dates=Object.values(uniqMap).sort((a,b)=>a-b);
      if(dates.length<3) return;
      const datesInStreak = new Set();
      for(let i=0;i<=dates.length-3;i++){
        const d1=dates[i], d2=dates[i+1], d3=dates[i+2];
        const diff1=(d2-d1)/(1000*60*60*24);
        const diff2=(d3-d2)/(1000*60*60*24);
        if(diff1===1 && diff2===1){
          datesInStreak.add(toKey(d1)); datesInStreak.add(toKey(d2)); datesInStreak.add(toKey(d3));
          let j=i+3;
          while(j<dates.length){
            const prev=dates[j-1], cur=dates[j];
            if((cur-prev)/(1000*60*60*24)===1){ datesInStreak.add(toKey(cur)); j++; }
            else break;
          }
        }
      }
      if(datesInStreak.size>=3){
        arr.forEach(a=>{ if(a.date && datesInStreak.has(toKey(a.date))){ idxYang3H.add(a.idx); } });
      }
    });

    const finalData=allData.map((o,idx)=>({
     ...o,
      is3HPlus: idxYang3H.has(idx),
      _prosesKey: cleanNode(o["Node/Pos"]).toLowerCase()
    }));

    res.setHeader("Access-Control-Allow-Origin","*");
    res.setHeader("Access-Control-Allow-Methods","GET,OPTIONS");
    res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({
      data: finalData,
      total: finalData.length,
      total3H: finalData.filter(f=>f.is3HPlus).length,
      count3hari: new Set(finalData.filter(f=>f.is3HPlus).map(d=>cleanNode(d["Node/Pos"]).toLowerCase())).size,
      totalPotongan: Object.keys(byNode).length
    });
  }catch(e){
    console.error(e);
    res.status(500).json({ error:e.message, data:[] });
  }
}