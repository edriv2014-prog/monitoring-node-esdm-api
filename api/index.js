import cors from 'cors';
import express from 'express';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'OK - API ESDM HIDUP!' });
});

app.get('/api/data', async (req, res) => {
  try {
    const SHEET_ID = process.env.SHEET_ID;
    const API_KEY = process.env.SHEET_API_KEY;
    const SHEET_NAME = process.env.SHEET_NAME || 'Sheet1';

    if (!SHEET_ID ||!API_KEY) {
      return res.status(500).json({ error: 'SHEET_ID / SHEET_API_KEY belum di set di Vercel' });
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_NAME}?key=${API_KEY}`;

    const response = await fetch(url);
    const result = await response.json();

    if (!result.values) {
      console.log('Google Sheet Error:', result);
      return res.status(500).json({ error: 'Gagal baca sheet', detail: result });
    }

    const [headers,...rows] = result.values;
    const data = rows.map(row => {
      let obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || '';
      });
      return obj;
    });

    res.json({ data: data });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default app;