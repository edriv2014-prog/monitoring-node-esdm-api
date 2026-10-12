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

    
    const cleanNode = (s)=>{
      return s.trim()
        .replace(/^\s*\d+\s*[\.\)]\s*/g,'') // 2.  2) 
        .replace(/^\s*\d+\s+/,'')           // 2 Gedung
        .trim();
    };
    let raw=[];
    for(const g of groups){
      let fullText = g.texts.join('\n');
      if(!fullText) continue;
      fullText = fullText.replace(/\s+(\d+[\.\)]\s+(?:Pos|PVMBG|Wisma|Gedung|Kampus|Tekmira|PATGTL|BBPMB|PPSDM|BPH|Ditjen|Geowisata))/gi, '\n$1');

      const lines = fullText.split('\n');
      let currentNode = '';
      let lastEntry = null;

      for(let i=0;i<lines.length;i++){
        let line = lines[i].trim();
        if(!line) continue;

        if(/^RFO\s*:/i.test(line) && !/Duration/i.test(line)){
          if(lastEntry){
            const extra = line.replace(/^RFO\s*:\s*/i,'').trim();
            lastEntry.KENDALA += ' ' + extra;
            lastEntry.KENDALA = lastEntry.KENDALA.replace(/\s+/g,' ').trim();
          }
          continue;
        }

        if(!/Duration|RFO/i.test(line)){
          const cleaned = cleanNode(line);
          if(cleaned && cleaned.length>=3){
            currentNode = cleaned;
          }
          continue;
        }

        if(/Duration/i.test(line)){
          let nodeName = currentNode;
          const beforeDur = line.split(/Duration/i)[0].trim();
          if(beforeDur){
            const cleanedBefore = cleanNode(beforeDur);
            if(cleanedBefore && cleanedBefore.length>=3 && !/^Icon$/i.test(cleanedBefore)){
              nodeName = cleanedBefore;
            }
          }

          let durText='', rfoText='';
          const both = line.match(/Duration\s*:\s*(.*?)\s*RFO\s*:\s*(.*)/i);
          if(both){
            durText = both[1].trim();
            rfoText = both[2].trim();
          } else {
            const dOnly = line.match(/Duration\s*:\s*(.*)/i);
            if(dOnly){
              durText = dOnly[1].trim();
              if(i+1 < lines.length && /RFO/i.test(lines[i+1])){
                const rOnly = lines[i+1].match(/RFO\s*:\s*(.*)/i);
                if(rOnly){
                  rfoText = rOnly[1].trim();
                  i++;
                }
              }
            }
          }

          rfoText = rfoText.split(/\s*\d+[\.\)]\s+(?:Pos|PVMBG|Wisma|Gedung|Kampus|Tekmira|PATGTL|BPH|Ditjen|Geowisata)/i)[0].trim();
          nodeName = cleanNode(nodeName);

          if(nodeName && durText){
            const entry = {
              Tanggal: g.tgl,
              "Node/Pos": nodeName,
              LINK: 'Icon',
              KENDALA: `Duration : ${durText.replace(/\s+/g,' ')} RFO : ${rfoText.replace(/\s+/g,' ')}`,
              _day: toDay(g.tgl)
            };
            raw.push(entry);
            lastEntry = entry;
            currentNode = '';
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
