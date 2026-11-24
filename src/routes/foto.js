const path = require('path');
const express = require('express');
const { query } = require('../db/query');
const { folderUpload } = require('../services/uploads');

const router = express.Router();
const JENIS = { jpg: 'image/jpeg', png: 'image/png' };
const TIDAK_ADA = { error: 'Foto tidak ditemukan' };

// id absensi dicocokkan BERSAMA sekolah_id dari token admin. Path file hanya dari database.
router.get('/:id', async (req, res) => {
  if (!/^\d{1,15}$/.test(req.params.id)) return res.status(404).json(TIDAK_ADA);

  const hasil = await query(
    'SELECT foto_path FROM absensi WHERE id = $1 AND sekolah_id = $2',
    [req.params.id, req.sekolahId]
  );
  const fotoPath = hasil.rows[0] && hasil.rows[0].foto_path;
  if (!fotoPath) return res.status(404).json(TIDAK_ADA);

  const dasar = path.resolve(folderUpload());
  const penuh = path.resolve(dasar, fotoPath);
  if (!penuh.startsWith(dasar + path.sep)) return res.status(404).json(TIDAK_ADA);

  const jenis = JENIS[path.extname(penuh).slice(1)];
  if (!jenis) return res.status(404).json(TIDAK_ADA);

  res.set({
    'Content-Type': jenis,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.sendFile(penuh, (err) => {
    if (err && !res.headersSent) res.status(404).json(TIDAK_ADA);
  });
});

module.exports = router;
