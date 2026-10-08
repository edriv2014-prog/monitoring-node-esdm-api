export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const gid=req.query.gid||'285923348';
    let csvUrl=process.env.SHEET_CSV_URL||'';
    if(!csvUrl) throw new Error('SHEET_CSV_URL kosong');
    if(csvUrl.includes('/edit')){
      const m=csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if(m) csvUrl=`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
    }
    if(!csvUrl.includes('gid=')) csvUrl+=(csvUrl.includes('?')?'&':'?')+`gid=${gid}&single=true`;

    const r = await fetch(csvUrl);
    if(!r.ok) throw new Error('Gagal fetch sheet: ' + r.status);
    const csv = await r.text();

    function parseCSV(text){
      const rows=[]; let curRow=[]; let cur=''; let inQuote=false;
      for(let i=0;i<text.length;i++){
        const c=text[i]; const next=text[i+1];
        if(c=='"'){
          if(inQuote && next=='"'){ cur+='"'; i++; }
          else inQuote=!inQuote;
        }else if(c==',' &&!inQuote){
          curRow.push(cur); cur='';
        }else if((c=='\n' || c=='\r') &&!inQuote){
          if(c=='\r' && next=='\n') i++;
          curRow.push(cur); rows.push(curRow); curRow=[]; cur='';
        }else{
          cur+=c;
        }
      }
      if(cur || curRow.length){ curRow.push(cur); rows.push(curRow); }
      return rows;
    }

    const allRows = parseCSV(csv).filter(row => row.join('').trim()!== '');
    if(allRows.length < 3) return res.status(200).json({data:[], total3H:0, url: csvUrl});

    const dataRows = allRows.slice(2);

    const bulan = {Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const toDay = (s)=>{
      if(!s) return null;
      s = s.toString().trim();
      let m = s.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/);
      if(m){
        let y = +m[3]; if(y < 100) y += 2000;
        const d = new Date(Date.UTC(y, bulan[m[2]]??0, +m[1]));
        return d.toISOString().slice(0,10);
      }
      m = s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
      if(!m) return null;
      const d = new Date(Date.UTC(+m[3], bulan[m[2]]??0, +m[1]));
      return d.toISOString().slice(0,10);
    };

    let lastTgl = '';
    let raw = [];

    for(let i=0;i<dataRows.length;i++){
      const cols = dataRows[i];
      const get = (idx)=> (cols[idx]||'').toString().replace(/^"|"$/g,'').trim();

      let tgl = get(0) || lastTgl;
      if(tgl) lastTgl = tgl;
      if(!tgl) continue;

      const detail = get(4) || '';
      if(!detail) continue;

      // === FIX LAPORAN 1H: 1 chunk = 1 Pos utuh (Node + Duration + RFO) ===
      const chunks = detail.split(/\s*\d+\.\s+/).filter(x=>x.trim());

      chunks.forEach(chunk=>{
        const full = chunk.trim()
        if(!full) return

        // Node/Pos = baris pertama sebelum Duration
        let nodeName = full.split('\n')[0].trim()
        const durIdx = full.search(/\nDuration\s*:/i)
        if(durIdx > 0){
          nodeName = full.substring(0, durIdx).trim()
        }

        raw.push({
          Tanggal: tgl,
          "Node/Pos": nodeName.replace(/^\d+\.\s*/,'').trim(),
          LINK: 'Icon',
          KENDALA: full, // full 3 baris, bukan cuma 1 baris
          _day: toDay(tgl),
          _prosesKey: nodeName + '|' + tgl
        })
      })
    }

    const byNode = {};
    raw.forEach(o=>{
      if(!byNode[o["Node/Pos"]]) byNode[o["Node/Pos"]] = new Set();
      if(o._day) byNode[o["Node/Pos"]].add(o._day);
    });

    const is3H = (node, day)=>{
      const days = [...(byNode[node]||[])].sort();
      const idx = days.indexOf(day);
      if(idx < 2) return false;
      const d1 = new Date(days[idx-2]), d2 = new Date(days[idx-1]), d3 = new Date(days[idx]);
      return (d2 - d1 === 86400000) && (d3 - d2 === 86400000);
    };

    const data = raw.map(o=>({...o, is3HPlus: is3H(o["Node/Pos"], o._day)}));
    const total3H = data.filter(d=>d.is3HPlus).length;
    const count3hari = Object.keys(byNode).filter(n=>{
      const days = [...byNode[n]].sort();
      for(let i=2;i<days.length;i++){
        const d1=new Date(days[i-2]), d2=new Date(days[i-1]), d3=new Date(days[i]);
        if((d2-d1===86400000)&&(d3-d2===86400000)) return true;
      }
      return false;
    }).length;

    const potonganMap = {};
    ;[...data].sort((a,b)=> new Date(a._day) - new Date(b._day)).forEach(o=>{
      if(!potonganMap[o["Node/Pos"]]) potonganMap[o["Node/Pos"]] = o;
    });

    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      data,
      url:csvUrl,
      potongan: Object.values(potonganMap),
      totalPotongan: Object.keys(potonganMap).length,
      total3H,
      count3hari,
      total: data.length
    });

  } catch(e){
    console.error(e);
    return res.status(200).json({data:[], error:e.message, total3H:0, total:0});
  }
}