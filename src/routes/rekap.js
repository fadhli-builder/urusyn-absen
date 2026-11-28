const express = require('express');
const { z } = require('zod');
const { rekapHarian, guruUntukBulan, absensiBulan } = require('../db/rekap');
const { ambilPengaturan } = require('../db/sekolah');
const { haversine } = require('../services/geo');
const { tanggalWIB } = require('../services/waktu');

const router = express.Router();

// tanggal kalender nyata dengan format YYYY-MM-DD (menolak 2026-02-30, dan sebagainya)
function tanggalValid(t) {
  if (typeof t !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(t)) return false;
  const [y, m, d] = t.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

async function kirimRekapHarian(req, res, tanggal) {
  const [baris, s] = await Promise.all([
    rekapHarian(req.sekolahId, tanggal),
    ambilPengaturan(req.sekolahId),
  ]);

  const jarak = (lat, lng) =>
    s && s.lat != null && s.lng != null && lat != null && lng != null
      ? Math.round(haversine(lat, lng, s.lat, s.lng))
      : null;
  const lokasi = (lat, lng, akurasi) =>
    lat == null
      ? null
      : { lat, lng, akurasiM: akurasi == null ? null : Math.round(akurasi), jarakM: jarak(lat, lng) };

  const bentuk = (b) => ({
    id: b.guru_id,
    nama: b.nama,
    aktif: b.aktif,
    absensiId: b.absensi_id,
    jamMasuk: b.jam_masuk,
    jamPulang: b.jam_pulang,
    adaFoto: b.foto_masuk, // dipertahankan agar klien lama tetap jalan
    fotoMasuk: b.foto_masuk,
    fotoPulang: b.foto_pulang,
    lokasiMasuk: lokasi(b.lat, b.lng, b.akurasi_m),
    lokasiPulang: lokasi(b.lat_pulang, b.lng_pulang, b.akurasi_pulang_m),
  });
  const hadir = baris.filter((b) => b.status === 'hadir').map(bentuk);
  const telat = baris.filter((b) => b.status === 'telat').map(bentuk);
  const belum = baris.filter((b) => !b.status).map((b) => ({ id: b.guru_id, nama: b.nama }));

  res.json({
    tanggal,
    hariIni: tanggal === tanggalWIB(),
    ringkasan: {
      total: baris.length,
      sudahAbsen: hadir.length + telat.length,
      telat: telat.length,
      belum: belum.length,
    },
    hadir,
    telat,
    belum,
  });
}

router.get('/hari-ini', async (req, res) => {
  await kirimRekapHarian(req, res, tanggalWIB());
});

// riwayat: tanggal apa pun sampai hari ini (masa depan ditolak)
router.get('/harian', async (req, res) => {
  const tanggal = req.query.tanggal;
  if (!tanggalValid(tanggal)) {
    return res.status(400).json({ error: 'Format tanggal harus YYYY-MM-DD, contoh 2026-11-27' });
  }
  if (tanggal > tanggalWIB()) {
    return res.status(400).json({ error: 'Tanggal tidak boleh di masa depan' });
  }
  await kirimRekapHarian(req, res, tanggal);
});

const skemaBulan = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);

router.get('/bulan', async (req, res) => {
  const cek = skemaBulan.safeParse(req.query.bulan);
  if (!cek.success) {
    return res.status(400).json({ error: 'Format bulan harus YYYY-MM, contoh 2026-11' });
  }
  const bulan = cek.data;
  const [tahun, nomor] = bulan.split('-').map(Number);
  const jumlahHari = new Date(Date.UTC(tahun, nomor, 0)).getUTCDate();
  const awal = bulan + '-01';

  const [guru, absensi] = await Promise.all([
    guruUntukBulan(req.sekolahId, awal),
    absensiBulan(req.sekolahId, awal),
  ]);

  const peta = new Map(
    guru.map((g) => [g.id, { id: g.id, nama: g.nama, aktif: g.aktif, hari: {}, hadir: 0, telat: 0 }])
  );
  for (const a of absensi) {
    const g = peta.get(a.guru_id);
    if (!g) continue;
    g.hari[Number(a.tanggal.slice(8, 10))] = {
      absensiId: a.id,
      status: a.status,
      jamMasuk: a.jam_masuk,
      jamPulang: a.jam_pulang,
      adaFoto: a.ada_foto,
    };
    if (a.status === 'telat') g.telat += 1;
    else g.hadir += 1;
  }

  res.json({ bulan, jumlahHari, guru: [...peta.values()] });
});

module.exports = router;
