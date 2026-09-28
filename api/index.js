import cors from 'cors';
import express from 'express';

const app = express();
app.use(cors());

app.get('/api/data', async (req, res) => {
  try {
    const SHEET_ID = '1f83CxoN-7Oqa_F7LwqejfK8bIrpW0wGJgZAkkeVgbik';
    const GID = req.query.gid || '285923348';

    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID}&tqx=out:json`;
    const r = await fetch(url);
    const txt = await r.text();

    // Cek kalau masih Restricted
    if (txt.includes('<!DOCTYPE') || txt.includes('Sorry')) {
      return res.status(500).json({
        error: 'SHEET MASIH RESTRICTED!',
        fix: 'Buka Sheet > Share > General access > Anyone with the link > Viewer'
      });
    }

    const json = JSON.parse(txt.substring(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    const headers = json.table.cols.map(c => c.label);
    const data = json.table.rows.map(row => {
      let o = {};
      row.c.forEach((cell, i) => {
        o[headers[i]] = cell? (cell.f || cell.v) : '';
      });
      return o;
    });

    res.json({ data });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default app;