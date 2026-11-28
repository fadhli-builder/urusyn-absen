const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { z } = require('zod');
const { folderUpload } = require('./uploads');

const FOTO_DUPLIKAT = 'Foto ini sudah pernah dipakai. Ambil selfie baru ya.';

// nama index unik foto (masuk dan pulang) supaya penolakan balapan bisa dikenali
const INDEX_FOTO_UNIK = ['absensi_foto_hash_unik', 'absensi_foto_pulang_hash_unik'];

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
const skemaLokasi = z.object({
  lat: angka(-90, 90),
  lng: angka(-180, 180),
  akurasi: angka(0, 100000),
});

// Validasi dan simpan selfie. Hasil: { fotoPath, fotoHash } atau { galat: { status, error } }.
// fotoSudahAda(sekolahId, hash) dikirim dari pemanggil supaya foto yang sama
// tidak bisa dipakai dua kali (termasuk masuk lalu pulang).
async function siapkanFoto(req, sekolahId, fotoSudahAda) {
  if (!req.file) return { galat: { status: 422, error: 'Selfie wajib dilampirkan.' } };

  const ext = deteksiJenis(req.file.buffer);
  if (!ext) return { galat: { status: 415, error: 'Foto harus berformat JPEG atau PNG.' } };

  const fotoHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  if (await fotoSudahAda(sekolahId, fotoHash)) {
    return { galat: { status: 409, error: FOTO_DUPLIKAT } };
  }

  const fotoPath = `${sekolahId}/${crypto.randomUUID()}.${ext}`;
  await fs.promises.mkdir(path.join(folderUpload(), String(sekolahId)), { recursive: true });
  await fs.promises.writeFile(path.join(folderUpload(), fotoPath), req.file.buffer, { flag: 'wx' });
  return { fotoPath, fotoHash };
}

module.exports = {
  FOTO_DUPLIKAT,
  INDEX_FOTO_UNIK,
  terimaFoto,
  hapusFile,
  skemaLokasi,
  siapkanFoto,
};
