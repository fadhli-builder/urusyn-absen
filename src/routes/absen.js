const express = require('express');
const { ambilPengaturan } = require('../db/sekolah');
const { ambilGuru } = require('../db/guru');
const { catatAbsenMasuk, sudahAbsenHariIni, fotoSudahAda } = require('../db/absensi');
const { haversine } = require('../services/geo');
const { tanggalWIB, hitungStatus } = require('../services/waktu');
const {
  FOTO_DUPLIKAT,
  INDEX_FOTO_UNIK,
  terimaFoto,
  hapusFile,
  skemaLokasi,
  siapkanFoto,
} = require('../services/fotoAbsen');

const router = express.Router();

router.post('/masuk', terimaFoto, async (req, res) => {
  const cek = skemaLokasi.safeParse(req.body);
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

  if (await sudahAbsenHariIni(req.sekolahId, req.guruId, tanggal)) {
    return res.status(409).json({ error: 'Anda sudah absen masuk hari ini.' });
  }

  // selfie: hanya kalau sekolah mengaktifkannya. Kalau mati, foto yang terlanjur dikirim diabaikan.
  let fotoPath = null;
  let fotoHash = null;
  if (s.selfie_aktif) {
    const foto = await siapkanFoto(req, req.sekolahId, fotoSudahAda);
    if (foto.galat) return res.status(foto.galat.status).json({ error: foto.galat.error });
    ({ fotoPath, fotoHash } = foto);
  }

  const status = hitungStatus(s.jam_masuk, s.toleransi_menit, waktu);
  let absen;
  try {
    absen = await catatAbsenMasuk(req.sekolahId, req.guruId, {
      tanggal,
      waktu,
      status,
      lat,
      lng,
      akurasi,
      fotoPath,
      fotoHash,
    });
  } catch (err) {
    await hapusFile(fotoPath);
    if (err.code === '23505' && INDEX_FOTO_UNIK.includes(err.constraint)) {
      return res.status(409).json({ error: FOTO_DUPLIKAT });
    }
    throw err;
  }
  if (!absen) {
    await hapusFile(fotoPath); // dua permintaan bersamaan: yang kalah tidak meninggalkan file
    return res.status(409).json({ error: 'Anda sudah absen masuk hari ini.' });
  }

  res.status(201).json({
    ok: true,
    id: absen.id,
    status: absen.status,
    tanggal: absen.tanggal,
    jam_masuk: absen.jam_masuk,
    jarak_m: Math.round(jarak),
  });
});

module.exports = router;
