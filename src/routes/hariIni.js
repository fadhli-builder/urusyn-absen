const express = require('express');
const { ambilPengaturan } = require('../db/sekolah');
const { query } = require('../db/query');
const { tanggalWIB } = require('../services/waktu');

const router = express.Router();

router.get('/hari-ini', async (req, res) => {
  const s = await ambilPengaturan(req.sekolahId);
  if (!s) return res.status(401).json({ error: 'Belum login' });

  const tanggal = tanggalWIB();
  const hasil = await query(
    'SELECT jam_masuk, jam_pulang, status FROM absensi WHERE sekolah_id = $1 AND guru_id = $2 AND tanggal = $3',
    [req.sekolahId, req.guruId, tanggal]
  );
  const r = hasil.rows[0];

  res.json({
    tanggal,
    sekolah: s.nama,
    selfieAktif: s.selfie_aktif,
    masuk: r ? { jam: r.jam_masuk, status: r.status } : null,
    pulang: r && r.jam_pulang ? { jam: r.jam_pulang } : null,
  });
});

module.exports = router;
