JavaScript
function getProsesKey(node, kendalaBersih){
  const low = kendalaBersih.toLowerCase();
  // ambil km
  const kmMatch = low.match(/(\d+[.,]?\d*\s*km)/);
  const km = kmMatch? kmMatch[1].replace(',','.').trim() : '';
  // ambil semua POP
  const pops = [...low.matchAll(/pop\s+([a-z]+)/g)].map(m=>m[1]).join('-');
  // ambil tower / JB kalau ada
  const towerMatch = low.match(/(jb|tower)\s*(\d+|[\w]+)/);
  const tower = towerMatch? towerMatch[0] : '';

  // kalau gak ada km & pop, fallback ke 40 char pertama RFO yang dinormalisasi
  if(!km &&!pops){
    let rfo = (low.split(/rfo\s*:/)[1]||low).replace(/gangguan|fo cut|pada|jarak|impact|cut over|dan saat ini.*|dan sudah.*|pemindahan/g,'').replace(/\s+/g,' ').trim().slice(0,50);
    return node+"||"+rfo;
  }
  return node+"||"+km+"||"+pops+"||"+tower; // contoh: Pos PGA Bur Ni Telong||3.7 km||bireun-takengon||jb tower 171
}
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS') return res.status(200).end();
  try{
    const gid=req.query.gid||'285923348';
    let csvUrl=process.env.SHEET_CSV_URL||"";
    if(csvUrl.includes('/edit')){ const m=csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/); if(m) csvUrl=`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`; }
    if(!csvUrl.includes('gid=')) csvUrl+=(csvUrl.includes('?')?'&':'?')+`gid=${gid}&single=true`;
    const r=await fetch(csvUrl); const t=await r.text();
    function parseCSV(t){ const rows=[]; let cur='',row=[],q=false; for(let i=0;i<t.length;i++){ let c=t[i],n=t[i+1]; if(c=='"'&&q&&n=='"'){cur+='"';i++;continue} if(c=='"'){q=!q;continue} if(c==','&&!q){row.push(cur);cur='';continue} if((c=='\n'||c=='\r')&&!q){ if(cur||row.length){row.push(cur);rows.push(row);row=[];cur=''} if(c=='\r'&&n=='\n') i++; continue } cur+=c; } if(cur||row.length){row.push(cur);rows.push(row)} return rows; }
    function splitPos(tx){ if(!tx||String(tx).trim()=='-') return []; return String(tx).trim().split(/(?=\d+\.\s)/).map(s=>s.trim()).filter(s=>s.length>5); }
    const rows=parseCSV(t); let out=[];
    for(let i=1;i<rows.length;i++){
      const rr=rows[i]; const tgl=(rr[0]||'').trim(); if(!tgl) continue;
      const posList=splitPos(rr[5]);
      for(const raw of posList){
        let m=raw.match(/^\d+\.\s*([^\n]+)/);
        let node=m? m[1]: raw.split('\n')[0];
        node=node.split(/Duration/i)[0].trim().replace(/\s+/g,' ').slice(0,120);
        if(node.length<3) continue;

        // JANGAN SPLIT DURATION - 1 nomor = 1 proses utuh
        // Contoh raw di image_d645b6.png: "1. Pos PGA Bur Ni Telong\nDuration 1 hari 16 menit...\nRFO...\n\nDuration 1 jam 30 menit..." = 1 BARIS
        let rfo = (raw.split(/RFO\s*:/i)[1]||raw).toLowerCase().replace(/\s+/g,' ').slice(0,80);
        const prosesKey = node+"||"+rfo;

        out.push({
          Tanggal:tgl,
          "Node/Pos":node,
          LINK:'Icon',
          KENDALA:raw.slice(0,900),
          _prosesKey:prosesKey,
          _key:tgl+'||'+node+'||'+rfo.slice(0,30)
        });
      }
    }
    const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const toDayKey=d=>{ const m=d.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); return m? new Date(+m[3],bulan[m[2]]??0,+m[1]).toISOString().slice(0,10):null; };
    const parseTgl=s=>{ const m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); return m? new Date(+m[3],bulan[m[2]]??0,+m[1]):new Date(0); };
    const map={}; out.forEach(o=>{ const day=toDayKey(o.Tanggal); if(!day) return; if(!map[o._prosesKey]) map[o._prosesKey]=[]; map[o._prosesKey].push({...o,_day:day}); });
    let result3H=[]; let nodes3H=new Set(); let keys3H=new Set();
    for(const k in map){
      const uniq=[...new Set(map[k].map(x=>x._day))].sort();
      if(uniq.length<3) continue;
      let streak=[uniq[0]];
      for(let i=1;i<=uniq.length;i++){
        const isLast=i===uniq.length; const diff=!isLast? (new Date(uniq[i])-new Date(uniq[i-1]))/86400000 : 999;
        if(!isLast && diff===1) streak.push(uniq[i]);
        else{ if(streak.length>=3){ map[k].forEach(row=>{ if(streak.includes(row._day)){ result3H.push(row); keys3H.add(row._key); nodes3H.add(row["Node/Pos"]); } }); } if(!isLast) streak=[uniq[i]]; }
      }
    }
    const clean=arr=>arr.map(({_day,_prosesKey,_key,...r})=>r).sort((a,b)=> parseTgl(b.Tanggal)-parseTgl(a.Tanggal));
    return res.json({
      data: req.query.filter==='3hari'? clean(result3H) : clean(out),
      total: out.length, total3H: result3H.length, totalTidak3H: out.length-result3H.length,
      count: req.query.filter==='3hari'? result3H.length : out.length, count3hari: nodes3H.size,
      nodes3hari:[...nodes3H], keys3hari:[...keys3H]
    });
  }catch(e){ return res.json({data:[], total:0, total3H:0, totalTidak3H:0, count3hari:0, nodes3hari:[], error:e.message}); }
}