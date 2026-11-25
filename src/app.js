const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const pool = require('./db/pool');
const { ambilPengaturan } = require('./db/sekolah');
const { ambilGuru } = require('./db/guru');
const { requireAdmin, requireGuru, wajibSudahGantiPassword } = require('./middleware/auth');
const { limiterAbsen } = require('./middleware/rateLimit');
const authRoutes = require('./routes/auth');
const gantiPasswordRoutes = require('./routes/gantiPassword');
const pengaturanRoutes = require('./routes/pengaturan');
const guruRoutes = require('./routes/guru');
const guruAuthRoutes = require('./routes/guruAuth');
const persetujuanRoutes = require('./routes/persetujuan');
const absenRoutes = require('./routes/absen');
const pulangRoutes = require('./routes/pulang');
const hariIniRoutes = require('./routes/hariIni');
const rekapRoutes = require('./routes/rekap');
const rekapCsvRoutes = require('./routes/rekapCsv');
const fotoRoutes = require('./routes/foto');
const { wajibPersetujuan } = require('./middleware/persetujuan');

const app = express();

const produksi = process.env.NODE_ENV === 'production';

// di belakang reverse proxy (Hari 17) set TRUST_PROXY=1 supaya rate limit membaca IP klien asli
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(produksi ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    strictTransportSecurity: produksi ? { maxAge: 15552000, includeSubDomains: false } : false,
    referrerPolicy: { policy: 'same-origin' },
  })
);

app.use((req, res, next) => {
  res.set('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=(), payment=()');
  next();
});

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
app.use('/api/absen', requireGuru, limiterAbsen); // batasi kiriman absen per guru
app.use('/api/absen', requireGuru, wajibPersetujuan, absenRoutes);
app.use('/api/absen', requireGuru, wajibPersetujuan, pulangRoutes);
app.use('/api/absen', requireGuru, wajibPersetujuan, hariIniRoutes);
app.use('/api/foto', requireAdmin, wajibSudahGantiPassword, fotoRoutes);
app.use('/api/ganti-password', requireAdmin, gantiPasswordRoutes);
app.use('/api/pengaturan', requireAdmin, wajibSudahGantiPassword, pengaturanRoutes);
app.use('/api/guru', requireAdmin, wajibSudahGantiPassword, guruRoutes);
app.use('/api/rekap', requireAdmin, wajibSudahGantiPassword, rekapRoutes);
app.use('/api/rekap', requireAdmin, wajibSudahGantiPassword, rekapCsvRoutes);

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
  const s = await ambilPengaturan(req.sekolahId);
  res.json({ id: g.id, nama: g.nama, slug: s ? s.slug : null });
});

// 404 untuk API dan halaman lain
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));
app.use((req, res) => res.status(404).type('text/plain').send('Halaman tidak ditemukan'));

// error handler global: detail hanya ke log server, tidak pernah ke klien
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err && (err.status || err.statusCode);
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Format data tidak valid' });
  }
  if (err && (err.type === 'entity.too.large' || status === 413)) {
    return res.status(413).json({ error: 'Data terlalu besar' });
  }
  console.error('[error]', req.method, req.path, err && err.stack ? err.stack : err);
  res.status(500).json({ error: 'Terjadi kesalahan di server' });
});

module.exports = app;
