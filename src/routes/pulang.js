const express = require('express');
const { ambilGuru } = require('../db/guru');
const { ambilPengaturan } = require('../db/sekolah');
const { ambilAbsenHariIni, catatAbsenPulang } = require('../db/absensiPulang');
const { tanggalWIB } = require('../services/waktu');

const router = express.Router();

const SUDAH_PULANG = { error: 'Anda sudah absen pulang hari ini.' };

// body permintaan sengaja tidak dibaca sama sekali: identitas hanya dari token
router.post('/pulang', async (req, res) => {
  const guru = await ambilGuru(req.sekolahId, req.guruId);
  if (!guru || !guru.aktif) return res.status(401).json({ error: 'Belum login' });

  const s = await ambilPengaturan(req.sekolahId);
  if (!s) return res.status(401).json({ error: 'Belum login' });

  const waktu = new Date();
  const tanggal = tanggalWIB(waktu);

  if (!s.aktif || (s.berlaku_sampai && s.berlaku_sampai < tanggal)) {
    return res.status(403).json({ error: 'Layanan absensi sekolah ini sedang tidak aktif' });
  }

  const hariIni = await ambilAbsenHariIni(req.sekolahId, req.guruId, tanggal);
  if (!hariIni) return res.status(409).json({ error: 'Anda belum absen masuk hari ini.' });
  if (hariIni.jam_pulang) return res.status(409).json(SUDAH_PULANG);

  const absen = await catatAbsenPulang(req.sekolahId, req.guruId, tanggal, waktu);
  if (!absen) return res.status(409).json(SUDAH_PULANG);

  res.json({
    ok: true,
    tanggal: absen.tanggal,
    jam_masuk: absen.jam_masuk,
    jam_pulang: absen.jam_pulang,
  });
});

module.exports = router;
