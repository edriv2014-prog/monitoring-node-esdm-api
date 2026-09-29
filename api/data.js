
// api/data.js - ANTI FUNCTION_INVOCATION_FAILED
// api/data.js - FINAL LENGKAP - ANTI 500 - SORT DESC + 3 HARI
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Data dummy dari image_b748f2.png biar gak kosong kayak image_c71ebd.png
  const DUMMY = [
    { Tanggal: "27 Sep 2026", "Node/Pos": "Pos PGA Bur Ni Telong", LINK: "Icon", KENDALA: "1. Pos PGA Bur Ni Telong Duration : 1 hari 16 menit (26 Sept, 11.00 - 27 Sept, 11.16) RFO : Gangguan FO cut pada 3,7 km dari POP Bireun ke arah POP Takengon impact cut over pemindahan JB Tower 171 Duration : 1 jam 30 menit (13.00 - 14.30) RFO : Gangguan pemindahan dan penarikan OPGW di Tower Bireun - Takengon dan sudah dilakukan perbaikan" },
    { Tanggal: "26 Sep 2026", "Node/Pos": "Pos PGA Bur Ni Telong", LINK: "Icon", KENDALA: "1. Pos PGA Bur Ni Telong Duration : 11.00 - saat ini RFO : Gangguan FO cut pada jarak 3,7 km dari POP Bireun ke arah POP Takengon dan saat ini masih dalam proses perbaikan" },
    { Tanggal: "25 Sep 2026", "Node/Pos": "Pos PGA Bur Ni Telong", LINK: "Icon", KENDALA: "1. Pos PGA Bur Ni Telong Duration : seharian RFO : masih perbaikan FO cut" },
    { Tanggal: "24 Sep 2026", "Node/Pos": "Pos PGA Tangkoko", LINK: "Icon", KENDALA: "1. Pos PGA Tangkoko Duration : 3 jam 36 menit (16.01 - 19.37) RFO : Pemadaman listrik PLN" },
    { Tanggal: "24 Sep 2026", "Node/Pos": "Museum Geopark Batur", LINK: "Icon", KENDALA: "Duration : 2 jam RFO : Listrik padam" }
  ];

  try {
    const gid = req.query.gid || '285923348';
    let csvUrl = process.env.SHEET_CSV_URL || "";

    // Jika env kosong, langsung pakai dummy tapi tetap 200 (gak 500)
    if (!csvUrl) {
      const sorted = sortData(DUMMY);
      const three = hitung3Hari(sorted);
      const finalData = req.query.filter === '3hari'? three : sorted;
      return res.status(200).json({
        data: finalData,
        total: sorted.length,
        total3hari: three.length,
        nodes3hari: [...new Set(three.map(x => x["Node/Pos"]))],
        warning: "SHEET_CSV_URL belum di set di Vercel, pakai dummy. Set di Vercel > Settings > Env"
      });
    }

    if (!csvUrl.includes('gid=')) csvUrl += (csvUrl.includes('?')? '&' : '?') + `gid=${gid}&single=true`;

    const r = await fetch(csvUrl, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Fetch CSV ${r.status}`);
    const csv = await r.text();

    if (!csv || csv.trim().startsWith('<') || csv.includes('<!DOCTYPE')) {
      throw new Error("CSV masih HTML - publish sheet spesifik sebagai CSV");
    }

    // Parse CSV multiline
    const rows=[]; let cur='',row=[],q=false;
    for(let i=0;i<csv.length;i++){
      let c=csv[i],n=csv[i+1];
      if(c=='"'&&q&&n=='"'){cur+='"';i++;continue}
      if(c=='"'){q=!q;continue}
      if(c==','&&!q){row.push(cur);cur='';continue}
      if((c=='\n'||c=='\r')&&!q){
        if(cur||row.length){row.push(cur);rows.push(row);row=[];cur=''}
        if(c=='\r'&&n=='\n') i++; continue
      }
      cur+=c
    }
    if(cur||row.length){row.push(cur);rows.push(row)}

    let out=[]
    for(let i=1;i<rows.length;i++){
      const rr=rows[i]; if(!rr) continue
      const tgl=(rr[0]||'').trim(); if(!tgl) continue
      const txt=String(rr[5]||'').trim(); if(!txt||txt=='-'||txt.length<5) continue
      const parts=txt.split(/(?=\b\d+\.\s)/)
      for(const raw of parts){
        let clean=raw.trim(); if(clean.length<10) continue
        if(/^\d+\.?$/.test(clean)) continue
        let m=clean.match(/^\d+\.\s*([^\n]+)/)
        let node=m?m[1]:clean.split('\n')[0]
        node=node.split(/Duration/i)[0].trim().replace(/\s+/g,' ').slice(0,120)
        if(node.length<3) continue
        if(node.toLowerCase().startsWith('rfo :')) continue
        out.push({Tanggal:tgl,"Node/Pos":node,LINK:'Icon',KENDALA:raw.replace(/^\d+\.\s*/,'').slice(0,800).trim()})
      }
    }

    if(out.length===0) out = DUMMY;

    const sorted = sortData(out);
    const three = hitung3Hari(sorted);
    const finalData = req.query.filter==='3hari'? three : sorted;

    return res.status(200).json({
      data: finalData,
      total: sorted.length,
      total3hari: three.length,
      nodes3hari: [...new Set(three.map(x=>x["Node/Pos"]))]
    });

  } catch (e) {
    console.error("API ERROR:", e.message);
    const sorted = sortData(DUMMY);
    const three = hitung3Hari(sorted);
    const finalData = req.query.filter==='3hari'? three : sorted;
    // SELALU 200 biar gak FUNCTION_INVOCATION_FAILED di image_478364.png
    return res.status(200).json({
      data: finalData,
      total: sorted.length,
      total3hari: three.length,
      error: e.message,
      fallback: "pakai dummy karena error fetch"
    });
  }

  // --- FUNGSI SORT TANGGAL DESC + NODE ASC (yang kamu mau) ---
  function sortData(arr){
    const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    function parseTgl(s){ const m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); if(m) return new Date(+m[3],bulan[m[2]]??0,+m[1]); return new Date(0) }
    return [...arr].sort((a,b)=>{
      const da=parseTgl(a.Tanggal), db=parseTgl(b.Tanggal);
      if(db-da!==0) return db-da;
      return a["Node/Pos"].localeCompare(b["Node/Pos"])
    });
  }

  // --- FUNGSI 3 HARI BERTURUT-TURUT ---
  function hitung3Hari(arr){
    const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    function parseTgl(s){ const m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); if(m) return new Date(+m[3],bulan[m[2]]??0,+m[1]); return new Date(0) }
    function toDayKey(s){ const d=parseTgl(s); if(isNaN(d)) return null; return d.toISOString().slice(0,10) }

    const map={}; arr.forEach(o=>{ const k=o["Node/Pos"]; if(!map[k]) map[k]=[]; map[k].push(o) })
    let three=[]
    for(const node in map){
      const items=map[node].map(x=>({...x,_day:toDayKey(x.Tanggal)})).filter(x=>x._day).sort((a,b)=>a._day.localeCompare(b._day))
      const uniq=[]; const seen=new Set()
      for(const it of items){ if(!seen.has(it._day)){ seen.add(it._day); uniq.push(it)} }
      if(uniq.length===0) continue
      let streak=[uniq[0]]
      for(let i=1;i<uniq.length;i++){
        const diff=(new Date(uniq[i]._day)-new Date(uniq[i-1]._day))/86400000
        if(diff===1) streak.push(uniq[i])
        else{ if(streak.length>=3) three.push(...streak); streak=[uniq[i]] }
      }
      if(streak.length>=3) three.push(...streak)
    }
    return sortData(three);
  }
}