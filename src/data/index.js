import axios from 'axios';

// Parser CSV tahan koma 17,6 dan newline dalam cell
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
  if(!text||text.trim()=='-')return[]
  // Pisah 1. 2. 3. walaupun tanpa newline (kasus 20 Sep Tangkoko)
  return String(text).split(/(?=\d+\.\s)/).map(s=>s.trim()).filter(s=>s.length>5)
}

export default async function handler(req,res){
  const gid=req.query.gid||'285923348'
  const SHEET_ID=process.env.SHEET_ID
  const url=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`
  const {data:csv} = await axios.get(url,{responseType:'text'})
  const table=parseCSV(csv)

  const out=[]
  for(let i=1;i<table.length;i++){
    const r=table[i]
    const tgl=(r[0]||'').trim(); if(!tgl) continue
    const iconCell=r[5]||'' // <- cek di sheet kamu, kalau meleset ganti jadi r[6]
    const dtpCell=r[11]||'' // <- cek juga r[12] kalau DTP masih -

    for(const raw of splitPos(iconCell)){
      const node=raw.replace(/^\d+\.\s*/,'').split(/Duration/i)[0].trim().slice(0,80)
      const dur=(raw.match(/Duration\s*:\s*([^\n]+)/i)||[])[1]||''
      const rfo=(raw.match(/RFO\s*:\s*([\s\S]+)/i)||[])[1]||raw
      out.push({Tanggal:tgl,"Node/Pos":node,LINK:'Icon',KENDALA:(dur?dur+' - ':'')+rfo.replace(/\s+/g,' ').slice(0,500)})
    }
    for(const raw of splitPos(dtpCell)){
      const node=raw.replace(/^\d+\.\s*/,'').split(/Duration/i)[0].trim().slice(0,80)
      const dur=(raw.match(/Duration\s*:\s*([^\n]+)/i)||[])[1]||''
      const rfo=(raw.match(/RFO\s*:\s*([\s\S]+)/i)||[])[1]||raw
      out.push({Tanggal:tgl,"Node/Pos":node,LINK:'DTP',KENDALA:(dur?dur+' - ':'')+rfo.replace(/\s+/g,' ').slice(0,500)})
    }
  }
  res.setHeader('Cache-Control','no-store')
  res.json({data:out, total:out.length})
}