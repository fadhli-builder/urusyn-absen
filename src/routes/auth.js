const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { query } = require('../db/query');
const { limiterLogin } = require('../middleware/rateLimit');
const { ambilSlugSekolah } = require('../services/sekolah');

const router = express.Router();

const PESAN_GAGAL = 'Sekolah atau password salah';
const HASH_PALSU = bcrypt.hashSync('hash-palsu-untuk-timing', 12);

const skema = z.object({
  sekolah: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(200),
});

function hariIniWIB() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

router.post('/login', limiterLogin, async (req, res) => {
  const cek = skema.safeParse(req.body);
  if (!cek.success) {
    return res.status(400).json({ error: 'Data tidak valid' });
  }
  const { password } = cek.data;
  const slug = ambilSlugSekolah(req);

  const hasil = await query(
    `SELECT s.id, s.aktif, s.berlaku_sampai, a.password_hash, a.harus_ganti_password
     FROM sekolah s
     JOIN akun_admin a ON a.sekolah_id = s.id AND a.username = 'admin'
     WHERE s.slug = $1`,
    [slug]
  );
  const row = hasil.rows[0];

  const cocok = await bcrypt.compare(password, row ? row.password_hash : HASH_PALSU);
  if (!row || !cocok) {
    return res.status(401).json({ error: PESAN_GAGAL });
  }

  const kedaluwarsa = row.berlaku_sampai && row.berlaku_sampai < hariIniWIB();
  if (!row.aktif || kedaluwarsa) {
    return res.status(403).json({ error: 'Langganan tidak aktif, hubungi Urusyn' });
  }

  const token = jwt.sign(
    { sekolahId: String(row.id), peran: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
  });

  res.json({ ok: true, harusGantiPassword: row.harus_ganti_password });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ ok: true });
});

module.exports = router;