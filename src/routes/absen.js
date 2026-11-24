const express = require('express');
const { z } = require('zod');
const { ambilPengaturan } = require('../db/sekolah');
const { ambilGuru } = require('../db/guru');
const { catatAbsenMasuk } = require('../db/absensi');
const { haversine } = require('../services/geo');
const { tanggalWIB, hitungStatus } = require('../services/waktu');

const router = express.Router();

// guruId di body sengaja tidak ada di skema: otomatis dibuang. Identitas hanya dari token.
const skemaMasuk = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  akurasi: z.number().min(0).max(100000),
});

router.post('/masuk', async (req, res) => {
  const cek = skemaMasuk.safeParse(req.body);
  if (!cek.success) {
    return res.status(400).json({ error: 'Lokasi tidak valid. Aktifkan GPS lalu coba lagi.' });
  }
  const { lat, lng, akurasi } = cek.data;

  const guru = await ambilGuru(req.sekolahId, req.guruId);
  if (!guru || !guru.aktif) {
    return res.status(401).json({ error: 'Belum login' });
  }

  const s = await ambilPengaturan(req.sekolahId);
  if (!s) return res.status(401).json({ error: 'Belum login' });

  const waktu = new Date();
  const tanggal = tanggalWIB(waktu);

  if (!s.aktif || (s.berlaku_sampai && s.berlaku_sampai < tanggal)) {
    return res.status(403).json({ error: 'Layanan absensi sekolah ini sedang tidak aktif' });
  }
  if (s.lat == null || s.lng == null || s.radius_m == null || !s.jam_masuk) {
    return res
      .status(422)
      .json({ error: 'Sekolah belum selesai diatur. Hubungi admin sekolah Anda.' });
  }
  if (s.akurasi_maks_m != null && akurasi > s.akurasi_maks_m) {
    return res.status(422).json({
      error: 'Sinyal GPS kurang akurat (sekitar ' + Math.round(akurasi) + ' m). Coba lagi di tempat terbuka.',
    });
  }

  const jarak = haversine(lat, lng, s.lat, s.lng);
  if (jarak > s.radius_m) {
    return res.status(422).json({
      error: 'Anda berada di luar area sekolah (sekitar ' + Math.round(jarak) + ' m dari titik sekolah).',
    });
  }

  const status = hitungStatus(s.jam_masuk, s.toleransi_menit, waktu);
  const absen = await catatAbsenMasuk(req.sekolahId, req.guruId, {
    tanggal,
    waktu,
    status,
    lat,
    lng,
    akurasi,
  });
  if (!absen) {
    return res.status(409).json({ error: 'Anda sudah absen masuk hari ini.' });
  }

  res.status(201).json({
    ok: true,
    status: absen.status,
    tanggal: absen.tanggal,
    jam_masuk: absen.jam_masuk,
    jarak_m: Math.round(jarak),
  });
});

module.exports = router;
