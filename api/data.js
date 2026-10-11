export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const gid = req.query.gid || '285923348';
    let csvUrl = process.env.SHEET_CSV_URL || '';
    if (!csvUrl) throw new Error('SHEET_CSV_URL kosong');
    if (csvUrl.includes('/edit')) {
      const m = csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (m) csvUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
    }
    if (!csvUrl.includes('gid=')) csvUrl += `${csvUrl.includes('?')? '&' : '?'}gid=${gid}&single=true`;

    const csv = await (await fetch(csvUrl)).text();
    function parseCSV(text){
      const rows=[]; let curRow=[]; let cur=''; let inQuote=false;
      for(let i=0;i<text.length;i++){
        const c=text[i]; const next=text[i+1];
        if(c=='"'){ if(inQuote && next=='"'){ cur+='"'; i++; } else inQuote=!inQuote; }
        else if(c==',' &&!inQuote){ curRow.push(cur); cur=''; }
        else if((c=='\n' || c=='\r') &&!inQuote){ if(c=='\r' && next=='\n') i++; curRow.push(cur); rows.push(curRow); curRow=[]; cur=''; }
        else cur+=c;
      }
      if(cur || curRow.length){ curRow.push(cur); rows.push(curRow); }
      return rows;
    }

    const allRows = parseCSV(csv).filter(row => row.join('').trim()!== '');
    const dataRows = allRows.slice(2);

    const bulan = {Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const toDay = (s)=>{
      if(!s) return null; s=s.toString().trim();
      let m=s.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/);
      if(m){ let y=+m[3]; if(y<100) y+=2000; return new Date(Date.UTC(y, bulan[m[2]]??0, +m[1])).toISOString().slice(0,10); }
      m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
      if(!m) return null;
      return new Date(Date.UTC(+m[3], bulan[m[2]]??0, +m[1])).toISOString().slice(0,10);
    };

    // 1. GROUP per tanggal (1 tanggal bisa 3 baris fisik)
    let groups = [];
    let curGroup = null;
    for(const cols of dataRows){
      const get=(idx)=>(cols[idx]||'').toString().trim();
      const rawTgl = get(0);
      const detail = get(4); // Detail Outage Icon
      if(rawTgl){
        if(curGroup) groups.push(curGroup);
        curGroup = {tgl: rawTgl, details: []};
      }
      if(!curGroup) continue;
      if(detail) curGroup.details.push(detail);
    }
    if(curGroup) groups.push(curGroup);

    // 2. PARSER BARU: cari Duration & RFO dulu, Node diambil dari atasnya (tahan tanpa nomor 1.)
    let raw=[];
    for(const g of groups){
      const fullText = g.details.join('\n');
      if(!fullText) continue;

      // Loop cari semua "Duration : ... RFO : ..."
      const regex = /Duration\s*:\s*(.*?)\s*RFO\s*:\s*/gis;
      let match;
      let lastIndex = 0;
      let matches = [];
      while((match = regex.exec(fullText)) !== null){
        matches.push({durStart: match.index, durEnd: regex.lastIndex, durText: match[1]});
      }

      for(let i=0;i<matches.length;i++){
        const cur = matches[i];
        const next = matches[i+1];
        const rfoStart = cur.durEnd;
        const rfoEnd = next ? next.durStart : fullText.length;
        let rfoText = fullText.substring(rfoStart, rfoEnd).trim();

        // RFO text mungkin masih ada sisa nomor Pos berikutnya di akhir, potong
        // Cari pola "2. Pos PGA" di akhir RFO, buang
        const cutIdx = rfoText.search(/\n?\s*\d+\.\s+Pos|\n\s*[A-Z][a-z]+\s+[A-Z][a-z]+\s+Duration/i);
        // Tapi untuk kasus 18 Jun, RFO diakhiri newline + "2. Pos...", kita potong yang setelah newline yang ada angka
        let cleanRfo = rfoText;
        const nextPosIdx = rfoText.search(/\n\d+\.\s+/);
        if(nextPosIdx>0){
          cleanRfo = rfoText.substring(0, nextPosIdx).trim();
        } else {
          // kalau RFO dan Pos selanjutnya tanpa newline (spasi): "RFO : ... 2. Pos PGA"
          const m2 = rfoText.match(/^(.*?)(?=\s+\d+\.\s+Pos)/s);
          if(m2) cleanRfo = m2[1].trim();
        }

        // Ambil Node: teks dari akhir RFO sebelumnya sampai awal Duration ini
        const prevRfoEnd = i===0 ? 0 : matches[i-1].durEnd + matches[i-1].rfoLen || 0;
        // Simpler: ambil substring dari lastIndex sampai cur.durStart
        const nodeBlock = fullText.substring(lastIndex, cur.durStart).trim();
        lastIndex = rfoEnd;

        // Node block bisa berisi: "Pos PGA Tangkoko" atau "2. Pos PGA Tandikat" atau "06) RFO : ..." (sisa)
        // Ambil baris terakhir yang bukan RFO
        let lines = nodeBlock.split('\n').map(s=>s.trim()).filter(Boolean);
        // Buang baris yang isinya cuma "RFO : ..."
        lines = lines.filter(l=>!/^RFO\s*:/i.test(l));
        let nodeName = lines.length ? lines[lines.length-1] : '';
        nodeName = nodeName.replace(/^\d+[\.\)]\s*/,'').trim(); // buang "1. " "2. " "06) "
        nodeName = nodeName.replace(/^RFO\s*:.*/i,'').trim();

        // Kalau nodeName masih kosong atau malah "Adanya pemadaman" (sisa RFO), ambil dari awal
        if(!nodeName || /Adanya|Pemadaman|Monitoring/i.test(nodeName) && nodeName.length > 30){
          // Coba ambil dari baris pertama di nodeBlock yang ada "Pos" atau "PVMBG" atau "Wisma" atau "Tekmira" atau "Kampus"
          const candidate = nodeBlock.match(/(Pos PGA[^\n]+|PVMBG[^\n]+|Wisma[^\n]+|Tekmira[^\n]+|Kampus[^\n]+)/i);
          if(candidate) nodeName = candidate[1].replace(/^\d+[\.\)]\s*/,'').trim();
        }

        if(!nodeName) continue;
        if(nodeName.length < 3) continue;
        if(/^(Duration|RFO)/i.test(nodeName)) continue;

        // Simpan panjang RFO untuk next iteration
        matches[i].rfoLen = cleanRfo.length;

        raw.push({
          Tanggal: g.tgl,
          "Node/Pos": nodeName,
          LINK: 'Icon',
          KENDALA: `Duration : ${cur.durText.trim().replace(/\s+/g,' ')} RFO : ${cleanRfo.replace(/\s+/g,' ')}`,
          _day: toDay(g.tgl)
        });
      }
    }

    const byNode={}; raw.forEach(o=>{ if(!byNode[o["Node/Pos"]]) byNode[o["Node/Pos"]]=new Set(); if(o._day) byNode[o["Node/Pos"]].add(o._day); });
    const is3H=(node,day)=>{ const days=[...(byNode[node]||[])].sort(); const idx=days.indexOf(day); if(idx<2) return false; const d1=new Date(days[idx-2]),d2=new Date(days[idx-1]),d3=new Date(days[idx]); return (d2-d1===86400000)&&(d3-d2===86400000); };
    const data=raw.map(o=>({...o, is3HPlus:is3H(o["Node/Pos"],o._day)}));
    const potonganMap={}; [...data].sort((a,b)=>new Date(a._day)-new Date(b._day)).forEach(o=>{ if(!potonganMap[o["Node/Pos"]]) potonganMap[o["Node/Pos"]]=o; });

    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ data, potongan:Object.values(potonganMap), total:data.length, total3H:data.filter(x=>x.is3HPlus).length, url:csvUrl });
  } catch(e){ return res.status(200).json({data:[], error:e.message, total:0}); }
}
