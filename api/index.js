import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'OK - API ESDM HIDUP!' });
});

app.get('/api/data', (req, res) => {
  res.json({ data: [] });
});

export default app;
