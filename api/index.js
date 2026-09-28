app.get('/api/data', async (req, res) => {
  try {
    const SHEET_ID = process.env.SHEET_ID || '1f83CxoN-7Oqa_F7LwqejfK8bIrpW0wGJgZAkkeVgbik';
    const GID = req.query.gid || '285923348';
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID}&tqx=out:json`;

    const response = await fetch(url);
    const text = await response.text();

    if (text.trim().startsWith('<!DOCTYPE') || text.includes('Sorry, unable')) {
      return res.status(500).json({ error: 'Sheet masih Restricted! Ubah jadi Anyone with the link dulu', url });
    }

    // Potong wrapper google.visualization...
    const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const json = JSON.parse(jsonStr);

    const headers = json.table.cols.map(c => c.label || c.id || '');
    const data = json.table.rows.map(r => {
      let obj = {};
      r.c.forEach((cell, i) => {
        obj[headers[i]] = cell? (cell.f?? cell.v?? '') : '';
      });
      return obj;
    });

    res.json({ data });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});