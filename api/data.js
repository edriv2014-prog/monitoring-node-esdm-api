export default async function handler(req, res) {
  const GID = req.query.gid || process.env.SHEET_GID || "285923348";
  const SHEET_ID = process.env.SHEET_ID || "1bZQ3M0lJ8z2nR9qW7p5X6vY8aBcDeFgHiJkLmNoPqRsTuV";
  const SHEET_CSV_URL = process.env.SHEET_CSV_URL || `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

  const cleanNode = (s) => {
    if (!s) return "";
    return String(s)
      .replace(/^\s*\d+[\s\.\-\)]+/g, "") // FINAL: buang 4. 5. 6. 7. di depan
      .replace(/^\s*\d+\s+/g, "")
      .trim();
  };

  try {
    const r = await fetch(SHEET_CSV_URL);
    let text = await r.text();
    
    // Parse CSV simple
    const lines = text.split("\n");
    const header = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const idxNode = header.findIndex(h => /Node\/Pos/i.test(h));
    const idxTgl = header.findIndex(h => /Tanggal/i.test(h));

    const data = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      // split by comma but respect quotes
      const cols = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || lines[i].split(",");
      let row = {};
      header.forEach((h, j) => {
        let v = (cols[j] || "").trim().replace(/^"|"$/g, "");
        row[h] = v;
      });

      // 3X CLEAN NODE/POS
      if (idxNode >= 0 && header[idxNode]) {
        const k = header[idxNode];
        row[k] = cleanNode(row[k]);
        // juga key variasi
        if (row["Node/Pos"]) row["Node/Pos"] = cleanNode(row["Node/Pos"]);
        if (row["Node"]) row["Node"] = cleanNode(row["Node"]);
      }

      // skip kosong
      if (!row["Node/Pos"] && idxNode>=0) {
        const k = header[idxNode];
        if (k && row[k]) row["Node/Pos"] = cleanNode(row[k]);
      }

      data.push(row);
    }

    // FINAL CLEAN lagi sebelum kirim
    const finalData = data.map(d => {
      const nd = cleanNode(d["Node/Pos"] || d["Node"] || "");
      return { ...d, "Node/Pos": nd };
    }).filter(d => d["Node/Pos"]);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({ data: finalData, total: finalData.length });
  } catch (e) {
    res.status(500).json({ error: e.message, data: [] });
  }
}
