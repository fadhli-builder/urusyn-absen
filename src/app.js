const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const pool = require('./db/pool');
const { ambilPengaturan } = require('./db/sekolah');
const { ambilGuru } = require('./db/guru');
const { requireAdmin, requireGuru, wajibSudahGantiPassword } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const gantiPasswordRoutes = require('./routes/gantiPassword');
const pengaturanRoutes = require('./routes/pengaturan');
const guruRoutes = require('./routes/guru');
const guruAuthRoutes = require('./routes/guruAuth');
const persetujuanRoutes = require('./routes/persetujuan');
const absenRoutes = require('./routes/absen');
const { wajibPersetujuan } = require('./middleware/persetujuan');

const app = express();
app.use(express.json());
app.use(cookieParser());

const publik = path.join(__dirname, '..', 'public');
app.use(express.static(publik, { extensions: ['html'] }));
app.get('/s/:slug', (req, res) => res.sendFile(path.join(publik, 's.html')));

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: true });
  } catch (err) {
    res.status(500).json({ ok: false, db: false });
  }
});

app.use('/api', authRoutes);
app.use('/api', guruAuthRoutes);
app.use('/api/persetujuan', requireGuru, persetujuanRoutes);
// sementara: bukti absen ditolak sebelum persetujuan. Diganti endpoint absen di Hari 11.
app.get('/api/absen/siap', requireGuru, wajibPersetujuan, (req, res) => res.json({ ok: true }));
app.use('/api/absen', requireGuru, wajibPersetujuan, absenRoutes);
app.use('/api/ganti-password', requireAdmin, gantiPasswordRoutes);
app.use('/api/pengaturan', requireAdmin, wajibSudahGantiPassword, pengaturanRoutes);
app.use('/api/guru', requireAdmin, wajibSudahGantiPassword, guruRoutes);

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

app.get('/api/profil-guru', requireGuru, async (req, res) => {
  const g = await ambilGuru(req.sekolahId, req.guruId);
  if (!g || !g.aktif) return res.status(401).json({ error: 'Belum login' });
  res.json({ id: g.id, nama: g.nama });
});

module.exports = app;
