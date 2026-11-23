const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const { daftarGuru, tambahGuru, ubahAktifGuru, ubahPinGuru } = require('../db/guru');

const router = express.Router();

router.get('/', async (req, res) => {
  res.json(await daftarGuru(req.sekolahId));
});

router.post('/', async (req, res) => {
  const cek = z.object({ nama: z.string().trim().min(2).max(100) }).safeParse(req.body);
  if (!cek.success) {
    return res.status(400).json({ error: 'Nama guru wajib diisi (2 sampai 100 karakter)' });
  }

  const pin = String(crypto.randomInt(100000, 1000000)); // 6 digit
  const pinHash = await bcrypt.hash(pin, 12);

  try {
    const guru = await tambahGuru(req.sekolahId, cek.data.nama, pinHash);
    res.status(201).json({ ...guru, pin }); // PIN hanya tampil sekali, ini satu-satunya
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

router.post('/:id/reset-pin', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(404).json({ error: 'Guru tidak ditemukan' });
  }
  const pin = String(crypto.randomInt(100000, 1000000));
  const pinHash = await bcrypt.hash(pin, 12);

  const guru = await ubahPinGuru(req.sekolahId, req.params.id, pinHash);
  if (!guru) {
    return res.status(404).json({ error: 'Guru tidak ditemukan' });
  }
  res.json({ pin }); // tampil sekali
});

module.exports = router;