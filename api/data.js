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
  try{
    let SHEET_ID = (process.env.SHEET_ID||'').trim()
    const m = SHEET_ID.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if(m) SHEET_ID = m[1]
    const gid = req.query.gid || '285923348'
    if(!SHEET_ID) return res.status(500).json({error:'SHEET_ID kosong', data:[]})

    const url=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`
    const r = await fetch(url)
    const csv = await r.text()
    if(csv.trim().startsWith('<')){
      return res.status(500).json({error:' ${url} Sheet belum Public11111! '+csv.slice(0,200), data:[]})
    }
    const table = parseCSV(csv)
    const out=[]
    for(let i=1;i<table.length;i++){
      const row=table[i]; if(!row||!row[0]) continue
      const tgl=String(row[0]||'').trim(); if(!tgl) continue
      const iconCell=row[5]||''
      const dtpCell=row[11]||''
      const pushCell=(cell,link)=>{
        for(const raw of splitPos(cell)){
          const node=raw.replace(/^\d+\.\s*/,'').split(/Duration/i)[0].trim().slice(0,100)
          const dur=(raw.match(/Duration\s*:\s*([^\n]+)/i)||[])[1]||''
          const rfo=(raw.match(/RFO\s*:\s*([\s\S]+)/i)||[])[1]||raw
          let kendala=(dur?dur+' - ':'')+rfo.replace(/\s+/g,' ').trim()
          if(node) out.push({Tanggal:tgl,"Node/Pos":node,LINK:link,KENDALA:kendala.slice(0,500)})
        }
      }
      pushCell(iconCell,'Icon'); pushCell(dtpCell,'DTP')
    }
    return res.json({data:out})
  }catch(e){ return res.status(500).json({error:e.message, data:[]}) }
}