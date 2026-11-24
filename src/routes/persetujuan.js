const express = require('express');
const { z } = require('zod');
const { ambilPersetujuan, simpanPersetujuan } = require('../db/persetujuan');
const { VERSI_PERSETUJUAN, TEKS_PERSETUJUAN } = require('../services/persetujuan');

const router = express.Router();

router.get('/', async (req, res) => {
  const p = await ambilPersetujuan(req.sekolahId, req.guruId);
  if (!p) return res.status(401).json({ error: 'Belum login' });
  res.json({
    versi: VERSI_PERSETUJUAN,
    teks: TEKS_PERSETUJUAN,
    sudah: Boolean(p.persetujuan_pada) && p.persetujuan_versi === VERSI_PERSETUJUAN,
  });
});

const skema = z.object({
  setuju: z.literal(true),
  versi: z.literal(VERSI_PERSETUJUAN),
});

router.post('/', async (req, res) => {
  const cek = skema.safeParse(req.body);
  if (!cek.success) {
    return res
      .status(400)
      .json({ error: 'Persetujuan tidak valid. Muat ulang halaman lalu coba lagi.' });
  }
  const hasil = await simpanPersetujuan(req.sekolahId, req.guruId, VERSI_PERSETUJUAN);
  if (!hasil) return res.status(401).json({ error: 'Belum login' });
  res.json({ ok: true });
});

module.exports = router;
