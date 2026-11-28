const express = require('express');
const { ambilGuru } = require('../db/guru');
const { ambilPengaturan } = require('../db/sekolah');
const { ambilAbsenHariIni, catatAbsenPulang } = require('../db/absensiPulang');
const { fotoSudahAda } = require('../db/absensi');
const { haversine } = require('../services/geo');
const { tanggalWIB } = require('../services/waktu');
const {
  FOTO_DUPLIKAT,
  INDEX_FOTO_UNIK,
  terimaFoto,
  hapusFile,
  skemaLokasi,
  siapkanFoto,
} = require('../services/fotoAbsen');

const router = express.Router();

const SUDAH_PULANG = { error: 'Anda sudah absen pulang hari ini.' };

// Aturannya sama dengan absen masuk: GPS harus akurat dan berada dalam radius sekolah,
// dan selfie wajib kalau sekolah mengaktifkannya. Identitas hanya dari token.
router.post('/pulang', terimaFoto, async (req, res) => {
  const cek = skemaLokasi.safeParse(req.body);
  if (!cek.success) {
    return res.status(400).json({ error: 'Lokasi tidak valid. Aktifkan GPS lalu coba lagi.' });
  }
  const { lat, lng, akurasi } = cek.data;

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

  if (s.lat == null || s.lng == null || s.radius_m == null) {
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

  let fotoPath = null;
  let fotoHash = null;
  if (s.selfie_aktif) {
    const foto = await siapkanFoto(req, req.sekolahId, fotoSudahAda);
    if (foto.galat) return res.status(foto.galat.status).json({ error: foto.galat.error });
    ({ fotoPath, fotoHash } = foto);
  }

  let absen;
  try {
    absen = await catatAbsenPulang(req.sekolahId, req.guruId, tanggal, {
      waktu,
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
    return res.status(409).json(SUDAH_PULANG);
  }

  res.json({
    ok: true,
    tanggal: absen.tanggal,
    jam_masuk: absen.jam_masuk,
    jam_pulang: absen.jam_pulang,
    jarak_m: Math.round(jarak),
  });
});

module.exports = router;
