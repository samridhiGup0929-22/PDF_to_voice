import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import translateRouter from './routes/translate.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasKey: Boolean(process.env.SARVAM_API_KEY) });
});

app.use('/api/translate', translateRouter);

// app.listen(PORT, () => {
//   console.log(`Paperwaves backend running on http://localhost:${PORT}`);
//   console.log(`Health check: http://localhost:${PORT}/api/health`);
//   if (!process.env.SARVAM_API_KEY) {
//     console.warn('WARNING: SARVAM_API_KEY is not set. Add it to server/.env, then restart this server.');
//   }
// }).on('error', (err) => {
//   if (err.code === 'EADDRINUSE') {
//     console.error(`Port ${PORT} is already in use — is another "npm run server" already running? Stop it first, or set PORT in .env.`);
//   } else {
//     console.error('Failed to start backend:', err);
//   }
//   process.exit(1);
// });


export default app;