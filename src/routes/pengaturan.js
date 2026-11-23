const express = require('express');
const { z } = require('zod');
const { ambilPengaturan, ubahPengaturan } = require('../db/sekolah');

const router = express.Router();

const skema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radius_m: z.number().int().min(10).max(5000),
    jam_masuk: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'format jam harus HH:MM'),
    toleransi_menit: z.number().int().min(0).max(180),
    akurasi_maks_m: z.number().int().min(5).max(1000),
    selfie_aktif: z.boolean(),
  })
  .partial(); // semua opsional; field lain (misal sekolah_id) otomatis dibuang

router.get('/', async (req, res) => {
  res.json(await ambilPengaturan(req.sekolahId));
});

router.put('/', async (req, res) => {
  const cek = skema.safeParse(req.body);
  if (!cek.success) {
    return res.status(400).json({
      error: 'Data tidak valid',
      detail: cek.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }
  res.json(await ubahPengaturan(req.sekolahId, cek.data));
});

module.exports = router;