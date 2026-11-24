const jwt = require('jsonwebtoken');
const { query } = require('../db/query');

function requireAdmin(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Belum login' });

  try {
    const data = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (data.peran !== 'admin' || !data.sekolahId) {
      return res.status(401).json({ error: 'Belum login' });
    }
    req.sekolahId = data.sekolahId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Belum login' });
  }
}

function requireGuru(req, res, next) {
  const token = req.cookies && req.cookies.token_guru;
  if (!token) return res.status(401).json({ error: 'Belum login' });

  try {
    const data = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (data.peran !== 'guru' || !data.sekolahId || !data.guruId) {
      return res.status(401).json({ error: 'Belum login' });
    }
    req.sekolahId = data.sekolahId;
    req.guruId = data.guruId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Belum login' });
  }
}

async function wajibSudahGantiPassword(req, res, next) {
  const hasil = await query(
    "SELECT harus_ganti_password FROM akun_admin WHERE sekolah_id = $1 AND username = 'admin'",
    [req.sekolahId]
  );
  const row = hasil.rows[0];
  if (!row) return res.status(401).json({ error: 'Belum login' });
  if (row.harus_ganti_password) {
    return res
      .status(403)
      .json({ error: 'Ganti password dulu sebelum melanjutkan', harusGantiPassword: true });
  }
  next();
}

module.exports = { requireAdmin, requireGuru, wajibSudahGantiPassword };
