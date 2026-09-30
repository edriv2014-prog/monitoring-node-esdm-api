for(const raw of posList){
  // raw = "1. Pos PGA Bur Ni Telong\nDuration : 1 hari 16 menit...\nRFO :..."
  let m = raw.match(/^\d+\.\s*([^\n]+)/);
  let node = m? m[1] : raw.split('\n')[0];
  node = node.split(/Duration/i)[0].trim().replace(/\s+/g,' ').slice(0,120);
  if(node.length<3) continue;

  // === BERSIHIN KENDALA: HAPUS NO URUT & NODE/POS ===
  let kendalaBersih = raw
   .replace(/^\d+\.\s*[^\n]+\n?/, '') // hapus "1. Pos PGA Bur Ni Telong\n"
   .replace(/^\s*Pos PGA[^\n]*\n?/i, '') // jaga-jaga kalau masih ada
   .trim();
  // kalau masih kosong (cuma header), skip
  if(kendalaBersih.length < 5) kendalaBersih = raw.slice(0,900);

  let rfo = (kendalaBersih.split(/RFO\s*:/i)[1] || kendalaBersih).toLowerCase().replace(/\s+/g,' ').slice(0,80);
  const prosesKey = node+"||"+rfo;

  out.push({
    Tanggal:tgl,
    "Node/Pos":node, // udah bersih
    LINK:'Icon',
    KENDALA:kendalaBersih.slice(0,900), // udah tanpa 1. dan tanpa Node/Pos
    _prosesKey:prosesKey,
    _key:tgl+'||'+node+'||'+rfo.slice(0,30)
  });
}