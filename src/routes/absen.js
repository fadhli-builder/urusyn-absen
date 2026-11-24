const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { ambilPengaturan } = require('../db/sekolah');
const { ambilGuru } = require('../db/guru');
const { catatAbsenMasuk, sudahAbsenHariIni, fotoSudahAda } = require('../db/absensi');
const { haversine } = require('../services/geo');
const { tanggalWIB, hitungStatus } = require('../services/waktu');
const { folderUpload } = require('../services/uploads');

const router = express.Router();

const FOTO_DUPLIKAT = 'Foto ini sudah pernah dipakai. Ambil selfie baru ya.';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 10 },
});

// multer hanya memproses permintaan multipart; JSON biasa langsung lewat
function terimaFoto(req, res, next) {
  upload.single('foto')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Foto terlalu besar (maksimal 2 MB).' });
    }
    return res.status(400).json({ error: 'Unggahan tidak valid.' });
  });
}

// jenis file dikenali dari ISI file, bukan dari nama atau Content-Type kiriman klien
function deteksiJenis(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length > 8 && png.every((b, i) => buf[i] === b)) return 'png';
  return null;
}

async function hapusFile(relatif) {
  if (!relatif) return;
  await fs.promises.unlink(path.join(folderUpload(), relatif)).catch(() => {});
}

// angka boleh datang sebagai number (JSON) atau string (form multipart)
const angka = (min, max) =>
  z
    .union([z.number(), z.string().trim().min(1).transform(Number)])
    .pipe(z.number().min(min).max(max));

// guruId di body sengaja tidak ada di skema: otomatis dibuang. Identitas hanya dari token.
const skemaMasuk = z.object({
  lat: angka(-90, 90),
  lng: angka(-180, 180),
  akurasi: angka(0, 100000),
});

router.post('/masuk', terimaFoto, async (req, res) => {
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

  if (await sudahAbsenHariIni(req.sekolahId, req.guruId, tanggal)) {
    return res.status(409).json({ error: 'Anda sudah absen masuk hari ini.' });
  }

  // selfie: hanya kalau sekolah mengaktifkannya. Kalau mati, foto yang terlanjur dikirim diabaikan.
  let fotoPath = null;
  let fotoHash = null;
  if (s.selfie_aktif) {
    if (!req.file) {
      return res.status(422).json({ error: 'Selfie wajib dilampirkan.' });
    }
    const ext = deteksiJenis(req.file.buffer);
    if (!ext) {
      return res.status(415).json({ error: 'Foto harus berformat JPEG atau PNG.' });
    }
    fotoHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    if (await fotoSudahAda(req.sekolahId, fotoHash)) {
      return res.status(409).json({ error: FOTO_DUPLIKAT });
    }

    fotoPath = `${req.sekolahId}/${crypto.randomUUID()}.${ext}`;
    await fs.promises.mkdir(path.join(folderUpload(), String(req.sekolahId)), { recursive: true });
    await fs.promises.writeFile(path.join(folderUpload(), fotoPath), req.file.buffer, { flag: 'wx' });
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
    if (err.code === '23505' && err.constraint === 'absensi_foto_hash_unik') {
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
