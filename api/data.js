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

    // GROUP per tanggal (Detail Icon + Detail Overload)
    let groups = [];
    let curGroup = null;
    for(const cols of dataRows){
      const get=(idx)=>(cols[idx]||'').toString();
      const rawTgl = get(0).trim();
      const detailIcon = get(4);
      const detailOver = get(5);
      if(rawTgl){
        if(curGroup) groups.push(curGroup);
        curGroup = {tgl: rawTgl, texts: []};
      }
      if(!curGroup) continue;
      if(detailIcon.trim()) curGroup.texts.push(detailIcon);
      if(detailOver.trim()) curGroup.texts.push(detailOver);
    }
    if(curGroup) groups.push(curGroup);

    let raw=[];
    for(const g of groups){
      const fullText = g.texts.join('\n');
      if(!fullText) continue;

      // PARSER ROBUST: jalan pakai indexOf Duration dan RFO
      let idx = 0;
      const lower = fullText.toLowerCase();
      while(true){
        const durPos = lower.indexOf('duration', idx);
        if(durPos === -1) break;
        const colonDur = fullText.indexOf(':', durPos);
        if(colonDur === -1) break;
        const rfoPos = lower.indexOf('rfo', colonDur);
        if(rfoPos === -1) break;
        const colonRfo = fullText.indexOf(':', rfoPos);
        if(colonRfo === -1) break;

        // Cari Duration berikutnya untuk batas akhir RFO
        const nextDurPos = lower.indexOf('duration', colonRfo+1);
        let rfoEnd = nextDurPos === -1 ? fullText.length : nextDurPos;

        // Node adalah teks dari idx sampai durPos
        let nodeBlock = fullText.substring(idx, durPos).trim();
        // Bersihkan sisa RFO sebelumnya yang mungkin masih ada angka "7. Kampus Vyatra"
        // Ambil baris terakhir yang mirip nama Pos
        let nodeName = '';
        // Split nodeBlock per newline
        let lines = nodeBlock.split('\n').map(s=>s.trim()).filter(Boolean);
        // Kalau nodeBlock tidak ada newline (kasus "bukti pemadaman 7. Kampus Vyatra"), cari pola di dalam satu baris
        if(lines.length === 0 && nodeBlock){
          lines = [nodeBlock];
        }
        // Cari dari belakang yang mengandung kata kunci Pos/PVMBG/Wisma/Gedung/Kampus/Tekmira/PATGTL
        for(let j=lines.length-1; j>=0; j--){
          let l = lines[j];
          // Buang kalau l masih RFO
          if(/^RFO\s*:/i.test(l)) continue;
          // Kalau ada "7. Kampus Vyatra" di baris yang sama dengan RFO sebelumnya, ambil setelah angka
          const mNum = l.match(/(?:\d+[\.\)]\s*)?((?:Pos PGA|PVMBG|Wisma|Gedung|Kampus|Tekmira|PATGTL).+)/i);
          if(mNum){
            nodeName = mNum[1].trim();
            break;
          }
          if(l.length>2 && !/Adanya|Monitoring|Pemadaman/i.test(l) || /Pos PGA|PVMBG|Wisma|Gedung|Kampus|Tekmira|PATGTL/i.test(l)){
            nodeName = l.replace(/^\d+[\.\)]\s*/,'').trim();
            if(nodeName) break;
          }
        }

        // Durasi dan RFO
        let durText = fullText.substring(colonDur+1, rfoPos).trim().replace(/\s+/g,' ');
        let rfoText = fullText.substring(colonRfo+1, rfoEnd).trim();

        // RFO text masih bisa kebawa "7. Kampus Vyatra Duration..." karena nextDurPos tadi belum dipotong angka
        // Potong jika ada " 7. " " 8. " di dalam RFO
        // Cari pola " 7. Kampus" atau "\n7. Kampus" di dalam rfoText
        const cutMatch = rfoText.match(/^(.*?)(?:\n?\s*\d+[\.\)]\s+(?:Pos|PVMBG|Wisma|Gedung|Kampus|Tekmira|PATGTL))/is);
        if(cutMatch){
          rfoText = cutMatch[1].trim();
          // Set ulang rfoEnd ke posisi angka tersebut
          const cutPos = fullText.indexOf(cutMatch[0].substring(cutMatch[1].length), colonRfo);
          if(cutPos>0) rfoEnd = cutPos;
        } else {
          // Kasus tanpa newline: "bukti pemadaman 7. Kampus Vyatra Duration"
          const cutMatch2 = rfoText.match(/^(.*?)\s+\d+[\.\)]\s+(?:Pos|PVMBG|Wisma|Gedung|Kampus|Tekmira|PATGTL)/is);
          if(cutMatch2){
            rfoText = cutMatch2[1].trim();
            rfoEnd = colonRfo+1 + cutMatch2[1].length;
          }
        }

        rfoText = rfoText.replace(/\s+/g,' ').trim();

        if(nodeName){
          nodeName = nodeName.replace(/^\d+[\.\)]\s*/,'').trim();
          // Filter node aneh
          if(nodeName.length>=3 && !/^(Duration|RFO)$/i.test(nodeName)){
            raw.push({
              Tanggal: g.tgl,
              "Node/Pos": nodeName,
              LINK: 'Icon',
              KENDALA: `Duration : ${durText} RFO : ${rfoText}`,
              _day: toDay(g.tgl)
            });
          }
        }

        idx = rfoEnd;
        if(idx >= fullText.length) break;
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
