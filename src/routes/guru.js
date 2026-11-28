const express = require('express');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const { daftarGuru, tambahGuru, ubahAktifGuru, ubahPinGuru } = require('../db/guru');
const { skemaPin } = require('../services/pin');

const router = express.Router();

function pesanGalat(issue) {
  if (issue.path[0] === 'pin') {
    return issue.code === 'invalid_type' ? 'PIN wajib diisi (6 angka)' : issue.message;
  }
  return 'Nama guru wajib diisi (2 sampai 100 karakter)';
}

router.get('/', async (req, res) => {
  res.json(await daftarGuru(req.sekolahId));
});

// PIN ditentukan admin lewat form. Yang disimpan hanya hash-nya, jadi PIN tidak bisa dilihat lagi.
router.post('/', async (req, res) => {
  const cek = z
    .object({ nama: z.string().trim().min(2).max(100), pin: skemaPin })
    .safeParse(req.body);
  if (!cek.success) {
    return res.status(400).json({ error: pesanGalat(cek.error.issues[0]) });
  }

  const pinHash = await bcrypt.hash(cek.data.pin, 12);

  try {
    const guru = await tambahGuru(req.sekolahId, cek.data.nama, pinHash);
    res.status(201).json(guru);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Nama guru sudah ada' });
    }
    throw err;
  }
});

router.patch('/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(404).json({ error: 'Guru tidak ditemukan' });
  }
  const cek = z.object({ aktif: z.boolean() }).safeParse(req.body);
  if (!cek.success) {
    return res.status(400).json({ error: 'Data tidak valid' });
  }

  const guru = await ubahAktifGuru(req.sekolahId, req.params.id, cek.data.aktif);
  if (!guru) {
    return res.status(404).json({ error: 'Guru tidak ditemukan' });
  }
  res.json(guru);
});

// admin mengganti PIN guru dengan PIN buatannya sendiri
router.put('/:id/pin', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(404).json({ error: 'Guru tidak ditemukan' });
  }
  const cek = z.object({ pin: skemaPin }).safeParse(req.body);
  if (!cek.success) {
    return res.status(400).json({ error: pesanGalat(cek.error.issues[0]) });
  }

  const pinHash = await bcrypt.hash(cek.data.pin, 12);
  const guru = await ubahPinGuru(req.sekolahId, req.params.id, pinHash);
  if (!guru) {
    return res.status(404).json({ error: 'Guru tidak ditemukan' });
  }
  res.json({ ok: true });
});

module.exports = router;
