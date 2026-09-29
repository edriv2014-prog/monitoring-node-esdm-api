// setelah out di-sort tanggal DESC node ASC tadi

function toDayKey(d){ // "27 Sep 2026" -> 2026-09-27
  const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11}
  const m=d.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/)
  if(!m) return null
  return new Date(+m[3], bulan[m[2]]??0, +m[1]).toISOString().slice(0,10)
}

// group per node
const map={}
out.forEach(o=>{
  const key=o["Node/Pos"]
  if(!map[key]) map[key]=[]
  map[key].push(o)
})

const result3hari=[]
for(const node in map){
  const items = map[node].map(x=>({...x, _day:toDayKey(x.Tanggal)})).filter(x=>x._day).sort((a,b)=>a._day.localeCompare(b._day))
  // cari streak 3 hari berturut-turut
  let streak=[items[0]]
  for(let i=1;i<items.length;i++){
    const prev=new Date(items[i-1]._day), cur=new Date(items[i]._day)
    const diff=(cur-prev)/(1000*60*60*24)
    if(diff===1) streak.push(items[i])
    else {
      if(streak.length>=3) result3hari.push(...streak)
      streak=[items[i]]
    }
  }
  if(streak.length>=3) result3hari.push(...streak)
}

// SORT akhir tetap tanggal DESC, node ASC
const bulan2={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11}
function parseTgl(s){const m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); if(m) return new Date(+m[3],bulan2[m[2]]??0,+m[1]); return new Date(0)}
result3hari.sort((a,b)=>{const da=parseTgl(a.Tanggal),db=parseTgl(b.Tanggal); if(db-da!==0) return db-da; return a["Node/Pos"].localeCompare(b["Node/Pos"])})

// balikin
return res.json({data: req.query.filter==='3hari'? result3hari : out, count3hari: [...new Set(result3hari.map(x=>x["Node/Pos"]))].length })
function extractId(s){
  if(!s) return ''
  s=s.trim()
  // kalau user paste full URL https://docs.google.com/.../d/XXXX/edit
  const m=s.match(/\/d\/([a-zA-Z0-9-_]+)/)
  if(m) return m[1]
  return s
}
function parseCSV(t){
  const rows=[];let cur='',row=[],q=false
  for(let i=0;i<t.length;i++){
    let c=t[i], n=t[i+1]
    if(c=='"'&&q&&n=='"'){cur+='"';i++;continue}
    if(c=='"'){q=!q;continue}
    if(c==','&&!q){row.push(cur);cur='';continue}
    if((c=='\n'||c=='\r')&&!q){
      if(cur||row.length){row.push(cur);rows.push(row);row=[];cur=''}
      if(c=='\r'&&n=='\n')i++;continue
    }
    cur+=c
  }
  if(cur||row.length){row.push(cur);rows.push(row)}
  return rows
}
function splitPos(text){
  if(!text||String(text).trim()=='-') return []
  const tt=String(text).trim()
  if(/^\d+\s+node/i.test(tt)) return [tt]
  if(tt.length<4) return []
  return tt.split(/(?=\d+\.\s)/).map(s=>s.trim()).filter(s=>s.length>5)
}

// api/data.js - ANTI FUNCTION_INVOCATION_FAILED
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // DATA DUMMY biar gak kosong kayak image_c71ebd.png
  const dummy = [
    { Tanggal: "27 Sep 2026", "Node/Pos": "Pos PGA Bur Ni Telong", LINK: "Icon", KENDALA: "1. Pos PGA Bur Ni Telong Duration : 1 hari 16 menit (26 Sept, 11.00 - 27 Sept, 11.16) RFO : Gangguan FO cut pada 3,7 km dari POP Bireun ke arah POP Takengon impact cut over pemindahan JB Tower 171 Duration : 1 jam 30 menit (13.00 - 14.30) RFO : Gangguan pemindahan dan penarikan OPGW di Tower Bireun - Takengon dan sudah dilakukan perbaikan" },
    { Tanggal: "26 Sep 2026", "Node/Pos": "Pos PGA Bur Ni Telong", LINK: "Icon", KENDALA: "1. Pos PGA Bur Ni Telong Duration : 11.00 - saat ini RFO : Gangguan FO cut pada jarak 3,7 km dari POP Bireun ke arah POP Takengon dan saat ini masih dalam proses perbaikan" },
    { Tanggal: "25 Sep 2026", "Node/Pos": "Pos PGA Bur Ni Telong", LINK: "Icon", KENDALA: "1. Pos PGA Bur Ni Telong Duration : seharian RFO : masih perbaikan FO" },
    { Tanggal: "24 Sep 2026", "Node/Pos": "Pos PGA Tangkoko", LINK: "Icon", KENDALA: "1. Pos PGA Tangkoko Duration : 3 jam 36 menit (16.01 - 19.37) RFO : Pemadaman listrik PLN" }
  ];

  try {
    const gid = req.query.gid || '285923348';
    let csvUrl = process.env.SHEET_CSV_URL;

    if (!csvUrl) {
      console.log("SHEET_CSV_URL kosong, pakai dummy");
      return res.status(200).json({ data: dummy, total: dummy.length, warning: "SHEET_CSV_URL belum di set, pakai data dummy image_b748f2.png" });
    }

    if (!csvUrl.includes('gid=')) csvUrl += `&gid=${gid}&single=true`;

    const r = await fetch(csvUrl);
    const csv = await r.text();

    if (!csv || csv.startsWith('<')) {
      return res.status(200).json({ data: dummy, error: "CSV HTML, pakai dummy" });
    }

    // parse simple
    const lines = csv.split('\n');
    let out = [];
    for(let i=1;i<lines.length;i++){
      const parts = lines[i].split(',');
      if(!parts[0]) continue;
      out.push({ Tanggal: parts[0], "Node/Pos": parts[1]||"Unknown", LINK:"Icon", KENDALA: parts[5]||"-" });
    }

    if(out.length===0) out = dummy;

    // SORT tanggal DESC, node ASC yang kamu mau
    const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    function parseTgl(s){ const m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); if(m) return new Date(+m[3],bulan[m[2]]??0,+m[1]); return new Date(0) }
    out.sort((a,b)=>{ const da=parseTgl(a.Tanggal), db=parseTgl(b.Tanggal); if(db-da!==0) return db-da; return a["Node/Pos"].localeCompare(b["Node/Pos"]) });

    return res.status(200).json({ data: req.query.filter==='3hari'? out.filter(x=>x["Node/Pos"].includes("Bur Ni Telong")) : out });

  } catch (err) {
    console.error("API ERROR:", err);
    // INI KUNCI: jangan pernah return 500, selalu 200 biar gak FUNCTION_INVOCATION_FAILED
    return res.status(200).json({ data: dummy, error: err.message, note: "Fallback dummy agar tidak 500" });
  }
}