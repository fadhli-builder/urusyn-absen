const express = require('express');
const { z } = require('zod');
const { rekapHariIni, guruUntukBulan, absensiBulan } = require('../db/rekap');
const { tanggalWIB } = require('../services/waktu');

const router = express.Router();

router.get('/hari-ini', async (req, res) => {
  const tanggal = tanggalWIB();
  const baris = await rekapHariIni(req.sekolahId, tanggal);

  const bentuk = (b) => ({
    id: b.guru_id,
    nama: b.nama,
    absensiId: b.absensi_id,
    jamMasuk: b.jam_masuk,
    jamPulang: b.jam_pulang,
    adaFoto: b.ada_foto,
  });
  const hadir = baris.filter((b) => b.status === 'hadir').map(bentuk);
  const telat = baris.filter((b) => b.status === 'telat').map(bentuk);
  const belum = baris.filter((b) => !b.status).map((b) => ({ id: b.guru_id, nama: b.nama }));

  res.json({
    tanggal,
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
