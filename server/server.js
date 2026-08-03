import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import translateRouter from './routes/translate.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasKey: Boolean(process.env.GEMINI_API_KEY) });
});

app.use('/api/translate', translateRouter);

app.listen(PORT, () => {
  console.log(`Paperwaves backend running on http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn('WARNING: GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.');
  }
});
