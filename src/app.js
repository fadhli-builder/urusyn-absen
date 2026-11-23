const express = require('express');
const cookieParser = require('cookie-parser');
const pool = require('./db/pool');
const authRoutes = require('./routes/auth');
const { requireAdmin, wajibSudahGantiPassword } = require('./middleware/auth');
const gantiPasswordRoutes = require('./routes/gantiPassword');
const pengaturanRoutes = require('./routes/pengaturan');
const guruRoutes = require('./routes/guru');
const path = require('path');
const { ambilPengaturan } = require('./db/sekolah');

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

app.get('/api/saya', requireAdmin, async (req, res) => {
  const s = await ambilPengaturan(req.sekolahId);
  const a = await pool.query(
    "SELECT harus_ganti_password FROM akun_admin WHERE sekolah_id = $1 AND username = 'admin'",
    [req.sekolahId]
  );
  if (!s || !a.rows[0]) return res.status(401).json({ error: 'Belum login' });
  res.json({
    slug: s.slug,
    nama: s.nama,
    berlaku_sampai: s.berlaku_sampai,
    harusGantiPassword: a.rows[0].harus_ganti_password,
  });
});

app.use('/api', authRoutes);
app.use('/api/ganti-password', requireAdmin, gantiPasswordRoutes);
app.use('/api/pengaturan', requireAdmin, wajibSudahGantiPassword, pengaturanRoutes);
app.use('/api/guru', requireAdmin, wajibSudahGantiPassword, guruRoutes);

module.exports = app;