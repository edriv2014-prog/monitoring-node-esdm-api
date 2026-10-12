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

    // GROUP per tanggal: gabung semua baris fisik yang tanggalnya sama (kasus 1 Sep yang Pos+Duration+RFO dipisah 3 baris)
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
      let fullText = g.texts.join('\n');
      if(!fullText) continue;

      // NORMALISASI: paksa setiap " 2. Pos", " 7. Kampus" yang nempel di belakang RFO jadi newline
      // Jadi "bukti pemadaman 7. Kampus Vyatra Duration" -> "\n7. Kampus Vyatra Duration"
      fullText = fullText.replace(/\s+(\d+[\.\)]\s+(?:Pos|PVMBG|Wisma|Gedung|Kampus|Tekmira|PATGTL|BBPMB|PPSDM|PPTGL))/gi, '\n$1');
      
      // Sekarang setiap Pos harusnya sudah di baris baru
      // Split pakai regex yang cari blok: [optional nomor] [Nama Pos] Duration : ... RFO : ... sampai sebelum blok berikutnya
      const entryRegex = /^\s*(?:\d+[\.\)]\s*)?(.+?)\s+Duration\s*:\s*(.+?)\s+RFO\s*:\s*(.+?)$/gim;

      // Karena ada yang masih "Pos PGA Tangkoko\nDuration : ...\nRFO : ..." (node di baris terpisah), kita proses dengan cara kedua
      // Kita pecah per baris yang mengandung Duration
      const lines = fullText.split('\n');
      let currentNode = '';
      for(let i=0;i<lines.length;i++){
        let line = lines[i].trim();
        if(!line) continue;

        // Kalau baris ini adalah nama Pos saja (tanpa Duration)
        if(!/Duration/i.test(line) && !/RFO/i.test(line)){
          // Simpan sebagai candidate node, bersihkan nomor
          const cleaned = line.replace(/^\d+[\.\)]\s*/,'').trim();
          if(cleaned && !/^(Duration|RFO)/i.test(cleaned)){
            // Hanya simpan kalau mirip nama Pos/Gedung/Wisma dll atau panjang wajar
            if(/Pos|PVMBG|Wisma|Gedung|Kampus|Tekmira|PATGTL|BBPMB|PPSDM/i.test(cleaned) || cleaned.length < 40){
              currentNode = cleaned;
            }
          }
          continue;
        }

        // Kalau baris ini mengandung Duration
        if(/Duration/i.test(line)){
          let nodeName = currentNode;
          // Coba ambil node dari baris yang sama sebelum Duration
          const durIdx = line.search(/Duration/i);
          if(durIdx>0){
            let beforeDur = line.substring(0, durIdx).trim().replace(/^\d+[\.\)]\s*/,'').trim();
            if(beforeDur) nodeName = beforeDur;
          }

          // Extract Duration dan RFO dari line (dan mungkin lanjut ke baris berikutnya kalau RFO di baris selanjutnya)
          let durText = '';
          let rfoText = '';
          const durMatch = line.match(/Duration\s*:\s*(.*?)\s*RFO\s*:\s*(.*)/i);
          if(durMatch){
            durText = durMatch[1].trim();
            rfoText = durMatch[2].trim();
          } else {
            // Duration di baris ini, RFO di baris selanjutnya
            const durOnly = line.match(/Duration\s*:\s*(.*)/i);
            if(durOnly){
              durText = durOnly[1].trim();
              // Cari RFO di baris selanjutnya
              if(i+1 < lines.length && /RFO/i.test(lines[i+1])){
                const rfoOnly = lines[i+1].match(/RFO\s*:\s*(.*)/i);
                if(rfoOnly){
                  rfoText = rfoOnly[1].trim();
                  i++; // skip baris RFO
                }
              }
            }
          }

          // Bersihkan RFO kalau masih kebawa nomor Pos berikutnya
          rfoText = rfoText.split(/\s*\d+[\.\)]\s+(?:Pos|PVMBG|Wisma|Gedung|Kampus|Tekmira|PATGTL)/i)[0].trim();

          if(nodeName && durText){
            raw.push({
              Tanggal: g.tgl,
              "Node/Pos": nodeName,
              LINK: 'Icon',
              KENDALA: `Duration : ${durText.replace(/\s+/g,' ')} RFO : ${rfoText.replace(/\s+/g,' ')}`,
              _day: toDay(g.tgl)
            });
            currentNode = ''; // reset
          }
        }
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
