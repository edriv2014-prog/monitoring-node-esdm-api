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
  if(!csvUrl) return res.json({data:[], error:'SHEET_CSV_URL belum dipasang'})

  try{
    const r=await fetch(csvUrl); const csv=await r.text()
    if(req.query.debug) return res.json({csvPreview:csv.slice(0,2000), length:csv.length, url:csvUrl})
    if(csv.trim().startsWith('<')) return res.status(500).json({error:'Masih HTML, ganti Entire document jadi sheet spesifik', preview:csv.slice(0,500), data:[]})

    // parse CSV yang support newline dalam "..."
    const rows=[]; let cur='',row=[],q=false
    for(let i=0;i<csv.length;i++){let c=csv[i],n=csv[i+1]; if(c=='"'&&q&&n=='"'){cur+='"';i++;continue} if(c=='"'){q=!q;continue} if(c==','&&!q){row.push(cur);cur='';continue} if((c=='\n'||c=='\r')&&!q){if(cur||row.length){row.push(cur);rows.push(row);row=[];cur=''} if(c=='\r'&&n=='\n')i++;continue} cur+=c} if(cur||row.length){row.push(cur);rows.push(row)}

    const out=[]
    for(let i=1;i<rows.length;i++){
      const r=rows[i]; if(!r) continue
      const tgl=(r[0]||'').trim(); if(!tgl) continue
      const txt=String(r[5]||r[4]||'').trim(); if(!txt||txt=='-'||txt=='1') continue

      // pecah per "1. Pos..." "2. Pos..."
      const parts = txt.split(/(?=\b\d+\.\s)/)
      for(const raw of parts){
        let clean = raw.trim()
        if(clean.length < 10) continue
        if(/^\d+\.?$/.test(clean)) continue
        // ambil nama node
        let nodeMatch = clean.match(/^\d+\.\s*([^\n]+)/)
        let node = nodeMatch? nodeMatch[1] : clean.split('\n')[0]
        node = node.split(/Duration/i)[0].trim().slice(0,100)
        if(node.length < 3) continue
        if(node.toLowerCase().includes('rfo : pemadaman')) continue
        out.push({Tanggal:tgl,"Node/Pos":node,LINK:'Icon',KENDALA:raw.slice(0,700)})
      }
      // kalau gak ada nomor, anggap 1 baris = 1 node
      if(parts.length<=1 && out.length==0){
         out.push({Tanggal:tgl,"Node/Pos":`Baris ${i}`,LINK:'Icon',KENDALA:txt.slice(0,700)})
      }
    }
    // kalau masih 0, kasih raw rows biar gak kosong
    if(out.length==0 && rows.length>1){
      return res.json({data:[], debug:`rows=${rows.length}, cols first row=${rows[1]?.length}, sample=${JSON.stringify(rows[1]).slice(0,500)}`, csvPreview:csv.slice(0,1000)})
    }
    return res.json({data:out})
  }catch(e){return res.status(500).json({error:e.message,data:[]})}
}