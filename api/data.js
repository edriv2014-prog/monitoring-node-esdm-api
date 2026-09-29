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

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*')
  const gid=req.query.gid||'285923348'
  let csvUrl=process.env.SHEET_CSV_URL
  if(csvUrl &&!csvUrl.includes('gid=')) csvUrl+=`&gid=${gid}&single=true`
  try{
    const r=await fetch(csvUrl); const csv=await r.text()
    const rows=[]; let cur='',row=[],q=false
    for(let i=0;i<csv.length;i++){let c=csv[i],n=csv[i+1]; if(c=='"'&&q&&n=='"'){cur+='"';i++;continue} if(c=='"'){q=!q;continue} if(c==','&&!q){row.push(cur);cur='';continue} if((c=='\n'||c=='\r')&&!q){if(cur||row.length){row.push(cur);rows.push(row);row=[];cur=''} if(c=='\r'&&n=='\n')i++;continue} cur+=c} if(cur||row.length){row.push(cur);rows.push(row)}
    const out=[]
    for(let i=1;i<rows.length;i++){
      const rr=rows[i]; if(!rr) continue
      const tgl=(rr[0]||'').trim(); if(!tgl) continue
      const txt=String(rr[5]||'').trim(); if(!txt||txt=='-') continue
      const parts=txt.split(/(?=\b\d+\.\s)/)
      for(const raw of parts){
        let clean=raw.trim(); if(clean.length<10) continue
        let nm=clean.match(/^\d+\.\s*([^\n]+)/); let node=nm?nm[1]:clean.split('\n')[0]
        node=node.split(/Duration/i)[0].trim().slice(0,100); if(node.length<3) continue
        out.push({Tanggal:tgl,"Node/Pos":node,LINK:'Icon',KENDALA:raw.slice(0,700)})
      }
    }
    const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11}
    function parseTgl(s){try{const m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); if(m) return new Date(+m[3],bulan[m[2]]??0,+m[1]); return new Date(s)}catch{return new Date(0)}}
    out.sort((a,b)=>{const da=parseTgl(a.Tanggal),db=parseTgl(b.Tanggal); if(db-da!==0) return db-da; return (a["Node/Pos"]||'').localeCompare(b["Node/Pos"]||'')})
    return res.json({data:out})
  }catch(e){return res.status(500).json({error:e.message,data:[]})}
}