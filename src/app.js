const express = require('express');
const cookieParser = require('cookie-parser');
const pool = require('./db/pool');
const authRoutes = require('./routes/auth');
const { requireAdmin } = require('./middleware/auth');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: true });
  } catch (err) {
    res.status(500).json({ ok: false, db: false });
  }
});

app.get('/api/saya', requireAdmin, (req, res) => {
  res.json({ sekolahId: req.sekolahId });
});

app.use('/api', authRoutes);

module.exports = app;