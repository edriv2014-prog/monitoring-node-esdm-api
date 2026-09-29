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
  const rawText = `1. Pos PGA Bur Ni Telong
  Duration : 26 Nov 2025 (08.03) - saat ini
  RFO : Tim masih dalam progress perbaikan Fo Cut di jarak 13 km dari POP GI Takengon.
  2. Pos PGA Dempo
  Duration : 2 jam 12 menit
  RFO : Adanya gangguan Fo Cut di jarak 8,4Km dari Pop Pagar Alam ke arah lastmile akibat vandalisme dan sudah di lakukan penarikan kabel baru oleh tim iconplus
  ... (paste semua text kamu)...`;

  // coba fetch dulu
  try{
    const gid=req.query.gid||'285923348'
    let csvUrl=process.env.SHEET_CSV_URL
    if(csvUrl){
      const r=await fetch(csvUrl); const t=await r.text()
      if(!t.trim().startsWith('<')){ // kalau sudah CSV beneran
        //... parse CSV lama...
        return res.json({data: parsedDariCSV})
      }
    }
  }catch(e){}

  // FALLBACK: parse dari rawText di atas kalau masih HTML
  const out=[]; const blocks=rawText.split(/(?=\d+\.\s)/)
  for(const b of blocks){
    const m=b.match(/^\d+\.\s*Pos PGA\s*([^\n]+)\nDuration\s*:\s*([^\n]+)\nRFO\s*:\s*([\s\S]+)/i)
        || b.match(/^\d+\.\s*([^\n]+)\nDuration\s*:\s*([^\n]+)\nRFO\s*:\s*([\s\S]+)/i)
    if(m) out.push({Tanggal:new Date().toLocaleDateString('id-ID'),"Node/Pos":m[1].trim(), LINK:'Icon', KENDALA:`Duration: ${m[2].trim()} | ${m[3].trim()}`})
  }
  return res.json({data:out})
}