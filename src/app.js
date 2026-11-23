const express = require('express');
const cookieParser = require('cookie-parser');
const pool = require('./db/pool');
const authRoutes = require('./routes/auth');
const { requireAdmin, wajibSudahGantiPassword } = require('./middleware/auth');
const gantiPasswordRoutes = require('./routes/gantiPassword');
const pengaturanRoutes = require('./routes/pengaturan');
const guruRoutes = require('./routes/guru');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

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
app.use('/api/ganti-password', requireAdmin, gantiPasswordRoutes);
app.use('/api/pengaturan', requireAdmin, wajibSudahGantiPassword, pengaturanRoutes);
app.use('/api/guru', requireAdmin, wajibSudahGantiPassword, guruRoutes);

module.exports = app;