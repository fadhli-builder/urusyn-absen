const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { query } = require('../db/query');
const { limiterLoginGuru } = require('../middleware/rateLimit');
const { ambilSlugSekolah } = require('../services/sekolah');

const router = express.Router();

const PESAN_GAGAL = 'Nama atau PIN salah';
const HASH_PALSU = bcrypt.hashSync('hash-palsu-untuk-timing', 12);

const skema = z.object({
  guruId: z.string().regex(/^\d{1,15}$/),
  pin: z.string().regex(/^\d{6}$/),
});

function hariIniWIB() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function langgananAktif(s) {
  return s.aktif && !(s.berlaku_sampai && s.berlaku_sampai < hariIniWIB());
}

// daftar nama guru AKTIF untuk dropdown di halaman /s/<slug>
router.get('/s/:slug/guru', async (req, res) => {
  const slug = ambilSlugSekolah(req);
  const s = await query(
    'SELECT id, nama, aktif, berlaku_sampai FROM sekolah WHERE slug = $1',
    [slug]
  );
  const sekolah = s.rows[0];
  if (!sekolah) return res.status(404).json({ error: 'Sekolah tidak ditemukan' });
  if (!langgananAktif(sekolah)) {
    return res.status(403).json({ error: 'Layanan absensi sekolah ini sedang tidak aktif' });
  }

  const g = await query(
    'SELECT id, nama FROM guru WHERE sekolah_id = $1 AND aktif = true ORDER BY nama',
    [sekolah.id]
  );
  res.json({ sekolah: sekolah.nama, guru: g.rows });
});

router.post('/s/:slug/login', limiterLoginGuru, async (req, res) => {
  const cek = skema.safeParse(req.body);
  if (!cek.success) {
    return res.status(400).json({ error: 'Pilih nama dan isi PIN 6 digit' });
  }
  const slug = ambilSlugSekolah(req);

  // guru dicari BERSAMA slug: guru sekolah A tidak akan ketemu lewat link sekolah B
  const hasil = await query(
    `SELECT g.id, g.pin_hash, g.aktif, s.id AS sekolah_id,
            s.aktif AS sekolah_aktif, s.berlaku_sampai
     FROM guru g
     JOIN sekolah s ON s.id = g.sekolah_id
     WHERE s.slug = $1 AND g.id = $2`,
    [slug, cek.data.guruId]
  );
  const row = hasil.rows[0];

  const cocok = await bcrypt.compare(cek.data.pin, row ? row.pin_hash : HASH_PALSU);
  if (!row || !cocok || !row.aktif) {
    return res.status(401).json({ error: PESAN_GAGAL });
  }
  if (!langgananAktif({ aktif: row.sekolah_aktif, berlaku_sampai: row.berlaku_sampai })) {
    return res.status(403).json({ error: 'Layanan absensi sekolah ini sedang tidak aktif' });
  }

  const token = jwt.sign(
    { sekolahId: String(row.sekolah_id), guruId: String(row.id), peran: 'guru' },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.cookie('token_guru', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

// keluar: hapus cookie sesi guru supaya perangkat bisa dipakai guru lain
router.post('/s/:slug/logout', (req, res) => {
  res.clearCookie('token_guru', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ ok: true });
});

module.exports = router;
