
import express from 'express'
const router = express.Router()

const SHEET_ID = process.env.SHEET_ID || '1f83CxoN-7Oqa_F7LwqeJfK8bIrpW0wGJgZAkkcVgbik'

// GET /api/data?gid=285923348&rentang=Semua&acuan=2026-09-01
router.get('/', async (req,res)=>{
  try {
    const gid = req.query.gid || '285923348'
    const rentang = req.query.rentang || 'Semua'
    const acuan = req.query.acuan || new Date().toISOString().split('T')[0]
    const filterNode = req.query.node || 'Semua'

    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`
    const csv = await fetch(url).then(r=>r.text())

    // parse simple
    const lines = csv.split('\n').filter(Boolean)
    const headers = lines[0].split(',').map(h=>h.trim().replace(/"/g,''))
    let rows = lines.slice(1).map(l=>{
      const vals = l.split(',').map(v=>v.replace(/"/g,'').trim())
      const obj={}
      headers.forEach((h,i)=> obj[h]=vals[i]||'')
      return obj
    }).filter(r=>r.Tanggal)

    // FILTER: Jika Semua -> skip Acuan
    if(rentang !== 'Semua'){
      const acuanDate = new Date(acuan)
      rows = rows.filter(row=>{
        const tgl = new Date(row.Tanggal)
        const diff = (acuanDate - tgl) / (1000*60*60*24)
        if(rentang==='1 Hari') return diff>=0 && diff<=1
        if(rentang==='7 Hari') return diff>=0 && diff<=7
        if(rentang==='30 Hari') return diff>=0 && diff<=30
        if(rentang==='90 Hari') return diff>=0 && diff<=90
        return true
      })
    }

    if(filterNode !== 'Semua'){
      rows = rows.filter(r=>r['Node/Pos']===filterNode)
    }

    // SORT DESC - TERBARU DI ATAS (FIX UTAMA)
    rows.sort((a,b)=> new Date(b.Tanggal) - new Date(a.Tanggal))

    res.json({ count: rows.length, rentang, acuan: rentang==='Semua'?'diabaikan':acuan, sortedBy:'Tanggal DESC', data: rows })
  } catch(e){
    res.status(500).json({error:e.message})
  }
})

export default router
