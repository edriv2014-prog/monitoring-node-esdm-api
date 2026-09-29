// backend/src/data/index.js - FIX MULTI POS DALAM 1 CELL
import axios from 'axios'

const SHEET_ID = process.env.SHEET_ID // ganti dengan ID kamu kalau ada di env
const parseMulti = (raw, link, tgl) => {
  if(!raw || String(raw).trim() === '-' || String(raw).trim() === '') return []
  // Kalau cell isinya "1. Pos PGA Soputan... 2. Pos PGA Anak Krakatau..."
  const parts = String(raw).split(/\n(?=\d+\.)/).filter(Boolean)
  // fallback kalau cuma 1 baris tanpa newline
  const finalParts = parts.length? parts : [raw]

  return finalParts.map(p => {
    const clean = p.trim()
    // Ambil nama Node: baris pertama setelah angka
    const firstLine = clean.split('\n')[0].replace(/^\d+\.\s*/, '').trim()
    // Duration & RFO
    const duration = (clean.match(/Duration\s*:\s*([^\n]+)/i)||[])[1]||''
    const rfoMatch = clean.match(/RFO\s*:\s*([\s\S]+)/i)
    let rfo = rfoMatch? rfoMatch[1].replace(/^\s*\d+\.\s*.*/gm,'').trim() : clean
    rfo = rfo.slice(0, 500) // potong biar gak kepanjangan kayak di screenshot

    return {
      Tanggal: tgl,
      "Node/Pos": firstLine.split('Duration')[0].split('RFO')[0].trim().slice(0, 80) || 'Unknown',
      LINK: link,
      KENDALA: duration? `${duration} - ${rfo}` : rfo,
      _raw: clean
    }
  })
}

export default async function getData(gid){
  // pakai logic kamu yang lama untuk fetch google sheet csv
  const url = `https://docs.google.com/spreadsheets/d/${process.env.SHEET_ID||SHEET_ID}/export?format=csv&gid=${gid}`
  const {data:csv} = await axios.get(url)
  const lines = csv.split('\n').map(l=>l.split(',')) // kalau pakai parser CSV lain sesuaikan

  const header = lines[0]
  // Cari index kolom: sesuaikan dengan sheet kamu
  // Dari screenshot image_24365e.png:
  // ICON di kolom 5, DTP di kolom 11 (0-based)
  const result = []
  for(let i=1;i<lines.length;i++){
    const r = lines[i]
    const tgl = r[0]?.replace(/"/g,'').trim() // "14 Sep 2026"
    if(!tgl) continue

    const iconRaw = r[5] // "1. Pos PGA Soputan..."
    const dtpRaw = r[11] // "1. PPSDM Geominerba..."

    result.push(...parseMulti(iconRaw, 'Icon', tgl))
    result.push(...parseMulti(dtpRaw, 'DTP', tgl))
  }
  return result
}