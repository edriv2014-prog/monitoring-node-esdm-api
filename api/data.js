
export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try{
    const gid=req.query.gid||'285923348';
    let csvUrl=process.env.SHEET_CSV_URL||'';
    if(csvUrl.includes('/edit')){ const m=csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/); if(m) csvUrl=`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`; }
    if(!csvUrl.includes('gid=')) csvUrl+=`${csvUrl.includes('?')?'&':'?'}gid=${gid}&single=true`;
    const csv=await(await fetch(csvUrl)).text();
    function parseCSV(t){const rows=[];let curRow=[],cur='',q=false;for(let i=0;i<t.length;i++){const c=t[i],n=t[i+1];if(c=='"'){if(q&&n=='"'){cur+='"';i++;}else q=!q;}else if(c==','&&!q){curRow.push(cur);cur='';}else if((c=='\n'||c=='\r')&&!q){if(c=='\r'&&n=='\n') i++; curRow.push(cur); rows.push(curRow); curRow=[]; cur='';}else cur+=c;} if(cur||curRow.length){curRow.push(cur); rows.push(curRow);} return rows;}
    const allRows=parseCSV(csv).filter(r=>r.join('').trim()!=='');
    const dataRows=allRows.slice(2);
    const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const toDay=s=>{ if(!s) return null; s=s.toString().trim(); let m=s.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/); if(m){let y=+m[3]; if(y<100) y+=2000; return new Date(Date.UTC(y,bulan[m[2]]??0,+m[1])).toISOString().slice(0,10);} m=s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/); if(!m) return null; return new Date(Date.UTC(+m[3],bulan[m[2]]??0,+m[1])).toISOString().slice(0,10); };
    let lastTgl=''; let raw=[];
    for(const cols of dataRows){
      let tgl=(cols[0]||'').trim()||lastTgl; if(tgl) lastTgl=tgl; if(!tgl) continue;
      const detail=(cols[4]||'').trim(); if(!detail) continue;
      // 1 chunk = 1 Pos (Nama + Duration + RFO jadi 1)
      const parts=detail.split(/\n(?=\s*\d+\.\s+)/);
      for(let p of parts){
        p=p.replace(/^\s*\d+\.\s+/,'').trim(); if(!p) continue;
        const durIdx=p.search(/\n\s*Duration\s*:/i);
        const nodeName=durIdx>0? p.substring(0,durIdx).trim() : p.split('\n')[0].trim();
        if(/^(duration|rfo)\s*:/i.test(nodeName)) continue; // DEFENSE: jangan jadikan Duration jadi Node
        raw.push({Tanggal:tgl,"Node/Pos":nodeName,LINK:'Icon',KENDALA:p,_day:toDay(tgl)});
      }
    }
    const byNode={}; raw.forEach(o=>{ if(!byNode[o["Node/Pos"]]) byNode[o["Node/Pos"]]=new Set(); if(o._day) byNode[o["Node/Pos"]].add(o._day); });
    const is3H=(n,d)=>{ const days=[...(byNode[n]||[])].sort(); const i=days.indexOf(d); if(i<2) return false; const d1=new Date(days[i-2]),d2=new Date(days[i-1]),d3=new Date(days[i]); return (d2-d1===86400000)&&(d3-d2===86400000); };
    const data=raw.map(o=>({...o,is3HPlus:is3H(o["Node/Pos"],o._day)}));
    return res.status(200).json({data, total:data.length, total3H:data.filter(x=>x.is3HPlus).length, count3hari:Object.keys(byNode).filter(n=>{ const ds=[...byNode[n]].sort(); for(let i=2;i<ds.length;i++) if(new Date(ds[i])-new Date(ds[i-1])===86400000 && new Date(ds[i-1])-new Date(ds[i-2])===86400000) return true; return false; }).length, potongan:Object.values(Object.fromEntries([...data].sort((a,b)=>new Date(a._day)-new Date(b._day)).map(o=>[o["Node/Pos"],o])) )});
  }catch(e){ return res.status(200).json({data:[],[STRIPPED] }
}