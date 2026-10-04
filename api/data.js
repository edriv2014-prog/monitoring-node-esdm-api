// api/data.js
export default async function handler(req, res) {
  try {
    const gid = req.query.gid || '285923348';
    const SHEET_ID = '1f83CxoN-7Oqa_F7LwqejfK8bIrpW0wJgZAkkeVgbik';
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;

    const r = await fetch(url);
    if(!r.ok) throw new Error('Gagal fetch sheet: ' + r.status);
    const csv = await r.text();

    // Parse CSV simple (handle ", ")
    const lines = csv.split('\n').filter(l=>l.trim());
    if(lines.length < 3) return res.status(200).json({data:[], total3H:0});

    const headers = lines[1].split(',').map(h=>h.replace(/"/g,'').trim()); // baris 2 = header
    // headers: Tanggal (Otomatis), Backhaul, Outage, Overload, Detail Outage...

    const bulan = {Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const toDay = (s)=>{
      if(!s) return null;
      const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
      if(!m) return null;
      const d = new Date(Date.UTC(+m[3], bulan[m[2]]??0, +m[1]));
      return d.toISOString().slice(0,10);
    };

    let lastTgl = '';
    let raw = [];

    for(let i=2;i<lines.length;i++){
      // split dengan regex CSV yang aman
      const cols = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
      const get = (idx)=> (cols[idx]||'').replace(/^"|"$/g,'').trim();

      let tgl = get(0) || lastTgl; // <-- FIX MERGE: kalau kosong pakai tanggal sebelumnya
      if(tgl) lastTgl = tgl;
      if(!tgl) continue;

      const detail = get(4) || '';
      if(!detail) continue;

      // Bersihin "1. Pos PGA Soputan" -> "Pos PGA Soputan"
      const nodes = detail.split(/\d+\.\s+/).filter(x=>x.trim()).map(x=>x.split('\n')[0].trim());

      nodes.forEach(nodeLine=>{
        if(!nodeLine) return;
        const m = nodeLine.match(/^(.*?)\s+Duration\s*:/i);
        const node = m? m[1].trim() : nodeLine.slice(0,40);
        const kendala = nodeLine;

        raw.push({
          Tanggal: tgl,
          "Node/Pos": node.replace(/^\s*\d+\.\s*/,'').trim(),
          LINK: 'Icon',
          KENDALA: kendala,
          _day: toDay(tgl),
          _prosesKey: node + '|' + tgl
        });
      });
    }

    // Hitung 3H+ : Node muncul 3 hari berturut
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

    const data = raw.map(o=>({
     ...o,
      is3HPlus: is3H(o["Node/Pos"], o._day)
    }));

    const total3H = data.filter(d=>d.is3HPlus).length;
    const count3hari = Object.keys(byNode).filter(n=>{
      const days = [...byNode[n]].sort();
      for(let i=2;i<days.length;i++){
        const d1=new Date(days[i-2]), d2=new Date(days[i-1]), d3=new Date(days[i]);
        if((d2-d1===86400000)&&(d3-d2===86400000)) return true;
      }
      return false;
    }).length;

    // Patokan Tanggal Awal = tanggal pertama muncul per Node
    const potonganMap = {};
    [...data].sort((a,b)=> new Date(a._day) - new Date(b._day)).forEach(o=>{
      if(!potonganMap[o["Node/Pos"]]) potonganMap[o["Node/Pos"]] = o;
    });

    const potongan = Object.values(potonganMap);

    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      data,
      potongan,
      totalPotongan: potongan.length,
      totalPatokan: potongan.length,
      total3H,
      count3hari,
      total: data.length
    });

  } catch(e){
    console.error(e);
    return res.status(200).json({data:[], error:e.message, total3H:0, total:0});
  }
}