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
  const gid = req.query.gid || '285923348'
  let csvUrl = process.env.SHEET_CSV_URL
  if(csvUrl &&!csvUrl.includes('gid=')) csvUrl += `&gid=${gid}&single=true`
  if(!csvUrl){
    let id=(process.env.SHEET_ID||'').trim()
    const m=id.match(/\/d\/([a-zA-Z0-9-_]+)/); if(m) id=m[1]
    csvUrl=`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
  }
  try{
    const r=await fetch(csvUrl); const csv=await r.text()
    if(csv.trim().startsWith('<')) return res.status(500).json({error:'Masih HTML, cek Publish CSV!', preview:csv.slice(0,200), data:[]})
    // parse csv
    const rows=[];let cur='',row=[],q=false
    for(let i=0;i<csv.length;i++){let c=csv[i],n=csv[i+1];if(c=='"'&&q&&n=='"'){cur+='"';i++;continue} if(c=='"'){q=!q;continue} if(c==','&&!q){row.push(cur);cur='';continue} if((c=='\n'||c=='\r')&&!q){if(cur||row.length){row.push(cur);rows.push(row);row=[];cur=''} if(c=='\r'&&n=='\n')i++;continue} cur+=c} if(cur||row.length){row.push(cur);rows.push(row)}
    const out=[]; for(let i=1;i<rows.length;i++){const r=rows[i]; if(!r||!r[0]) continue; const tgl=r[0].trim(); if(!tgl) continue; const txt=String(r[5]||'').trim(); if(!txt||txt=='-') continue; const parts=txt.split(/(?=\d+\.\s)/); for(const raw of parts){const node=raw.replace(/^\d+\.\s*/,'').split(/Duration/i)[0].trim().slice(0,100); if(node) out.push({Tanggal:tgl,"Node/Pos":node,LINK:'Icon',KENDALA:raw.slice(0,500)})}}
    return res.json({data:out})
  }catch(e){return res.status(500).json({error:e.message,data:[]})}
}