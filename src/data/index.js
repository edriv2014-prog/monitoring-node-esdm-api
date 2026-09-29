import axios from 'axios';

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

export default async function getData(gid='285923348'){
  try{
    const SHEET_ID=process.env.SHEET_ID
    if(!SHEET_ID) { console.log('SHEET_ID kosong!'); return [] }
    const url=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`
    const {data:csv} = await axios.get(url,{responseType:'text'})
    const table=parseCSV(csv)
    console.log('CSV rows:',table.length)
    const out=[]
    for(let i=1;i<table.length;i++){
      const r=table[i]; if(!r||!r[0]) continue
      const tgl=String(r[0]||'').trim(); if(!tgl) continue
      const iconCell=r[5]||''
      const dtpCell=r[11]||''
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
    console.log('OUT:',out.length)
    return out
  }catch(e){
    console.error('getData error:',e.message)
    return []
  }
}