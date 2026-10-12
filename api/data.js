export default async function handler(req, res) {
  const SHEET_CSV_URL = process.env.SHEET_CSV_URL || "https://docs.google.com/spreadsheets/d/e/2PACX-1vRs7guoNrzRDNg8bP5epCOXStLlQsd9Ba8hPLweqQELJ5i0e-oEa6KRV1UYZpkvDJLOq8-XtVMn5hls/pub?output=csv";

  const cleanNode = (s) => {
    let v = String(s||'');
    v = v.replace(/^\s*[\d\.\-\)\:\s\u00A0\xA0]+/g, '').trim();
    v = v.replace(/^\d+\W+/g, '').trim();
    const m = v.match(/[A-Za-z].*/s);
    return m ? m[0].split('\n')[0].trim() : v.split('\n')[0].trim();
  };

  // CSV parser yang tahan newline di dalam quote
  function parseCSV(text) {
    const rows = [];
    let curRow = [];
    let curCol = '';
    let inQuote = false;
    for (let i=0;i<text.length;i++) {
      const c = text[i];
      const next = text[i+1];
      if (c === '"') {
        if (inQuote && next === '"') { curCol += '"'; i++; }
        else { inQuote = !inQuote; }
      } else if (c === ',' && !inQuote) {
        curRow.push(curCol);
        curCol = '';
      } else if ((c === '\n' || c === '\r') && !inQuote) {
        if (curCol || curRow.length) {
          curRow.push(curCol);
          rows.push(curRow);
          curRow = []; curCol = '';
        }
        if (c === '\r' && next === '\n') i++;
      } else {
        curCol += c;
      }
    }
    if (curCol || curRow.length) { curRow.push(curCol); rows.push(curRow); }
    return rows;
  }

  try {
    const r = await fetch(SHEET_CSV_URL);
    const text = await r.text();
    const rows = parseCSV(text);

    // rows[0] header, rows[2] subheader, data mulai rows[4] ke bawah
    const allData = [];

    for (let ri=4; ri<rows.length; ri++) {
      const cols = rows[ri];
      if (!cols || cols.length < 5) continue;
      const tanggal = (cols[0]||'').trim();
      const icon = (cols[1]||'').trim() || 'Icon';
      const detail = (cols[4]||'').trim(); // Detail Outage yang isinya banyak node
      if (!tanggal || !detail) continue;
      if (!/Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des/i.test(tanggal)) continue;

      // PECAH detail yang isinya "1. Pos PGA...\n\nDuration : ...\n\nRFO : ...\n\n2. Pos PGA..."
      // Split pakai lookahead nomor
      const entries = detail.split(/\n\s*\n\s*(?=\d+\.\s)/g);

      for (const entry of entries) {
        if (!entry.trim()) continue;
        const lines = entry.trim().split('\n').map(l=>l.trim()).filter(Boolean);
        if (!lines.length) continue;

        // Baris pertama adalah "1. Pos PGA Bur Ni Telong" atau "2. Gedung Arsip"
        let nodeRaw = lines[0];
        // Kadang node ada di baris "1. Pos PGA Bur Ni Telong" lalu next line langsung Duration, jadi nodeRaw sudah benar
        const durationLine = lines.find(l=>/Duration\s*:/i.test(l)) || '';
        const rfoLineIdx = lines.findIndex(l=>/RFO\s*:/i.test(l));
        let rfo = '';
        if (rfoLineIdx >=0) {
          rfo = lines.slice(rfoLineIdx).join(' ').replace(/RFO\s*:\s*/i,'').trim();
        }

        let duration = '';
        const durMatch = durationLine.match(/Duration\s*:\s*(.*)/i);
        if (durMatch) duration = durMatch[1].trim();

        const node = cleanNode(nodeRaw);
        if (!node) continue;

        // Gabung KENDALA seperti frontend kamu
        const kendala = `Duration : ${duration} RFO : ${rfo}`;

        allData.push({
          Tanggal: tanggal,
          "Node/Pos": node,
          NodeRaw: nodeRaw,
          LINK: icon,
          KENDALA: kendala,
          Duration: duration,
          RFO: rfo,
          _tanggalISO: tanggal
        });
      }
    }

    // Hitung 3H+ - grouping pakai cleanNode (sudah bersih) + tanggal
    // Untuk contoh kamu: 03 Jan Pos PGA Bur Ni Telong, 04 Jan 2. Pos PGA Bur Ni Telong, 05 Jan 3. Pos PGA Bur Ni Telong -> harus dianggap 1 node 3 hari berturut
    const bulan={Jan:0,Feb:1,Mar:2,Apr:3,Mei:4,May:4,Jun:5,Jul:6,Agu:7,Aug:7,Sep:8,Okt:9,Oct:9,Nov:10,Des:11,Dec:11};
    const toDate = (s) => {
      const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
      return m ? new Date(+m[3], bulan[m[2]]??0, +m[1]) : null;
    };

    const grouped = {};
    allData.forEach(o=>{
      const d = toDate(o.Tanggal);
      if(!d) return;
      const key = cleanNode(o["Node/Pos"]).toLowerCase();
      if(!grouped[key]) grouped[key]=[];
      grouped[key].push({ date: d, dateStr: o.Tanggal });
    });

    // Deteksi 3 hari berturut-turut
    const tigaHariSet = new Set();
    Object.entries(grouped).forEach(([node, arr])=>{
      const sorted = [...new Set(arr.map(a=>a.date.getTime()))].sort((a,b)=>a-b).map(t=>new Date(t));
      for(let i=0;i<sorted.length-2;i++){
        const d1=sorted[i], d2=sorted[i+1], d3=sorted[i+2];
        const diff1 = (d2-d1)/(1000*60*60*24);
        const diff2 = (d3-d2)/(1000*60*60*24);
        if(diff1===1 && diff2===1){
          tigaHariSet.add(node);
        }
      }
    });

    const finalData = allData.map(o=>{
      const key = cleanNode(o["Node/Pos"]).toLowerCase();
      return { ...o, is3HPlus: tigaHariSet.has(key), _prosesKey: key };
    });

    const total3H = finalData.filter(f=>f.is3HPlus).length;
    const count3hari = tigaHariSet.size;

    res.setHeader("Access-Control-Allow-Origin","*");
    res.setHeader("Access-Control-Allow-Methods","GET,OPTIONS");
    res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({ data: finalData, total: finalData.length, total3H, count3hari, totalPotongan: Object.keys(grouped).length });
  } catch(e){
    console.error(e);
    res.status(500).json({ error: e.message, stack: e.stack, data: [] });
  }
}
