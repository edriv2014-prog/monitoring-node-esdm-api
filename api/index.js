import Papa from 'papaparse'

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
    const SHEET_ID=process.env.SHEET_ID
    const gid=req.query.gid||'285923348'
    if(!SHEET_ID) return res.status(500).json({error:'SHEET_ID belum di-set di Vercel', data:[]})

    const url=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`
    const r = await fetch(url) // pakai fetch bawaan Vercel, bukan node-fetch
    const csv = await r.text()
    const table = Papa.parse(csv,{skipEmptyLines:true}).data

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
          if(!kendala||kendala=='-') kendala=raw.slice(0,500)
          if(node) out.push({Tanggal:tgl,"Node/Pos":node,LINK:link,KENDALA:kendala.slice(0,500)})
        }
      }
      pushCell(iconCell,'Icon')
      pushCell(dtpCell,'DTP')
    }
    res.json({data:out})
  }catch(e){
    res.status(500).json({error:e.message, data:[]})
  }
}