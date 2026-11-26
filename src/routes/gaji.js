const express = require('express');
const { z } = require('zod');
const { gajiBulan, ubahTarifGuru } = require('../db/gaji');
const { ambilPengaturan } = require('../db/sekolah');
const { buatCsv } = require('../services/csv');

const router = express.Router();
const skemaBulan = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const MAKS_PERTEMUAN = 20;
const MAKS_TARIF = 10000000;

// Gaji = hari hadir x pertemuan per hari x tarif. Telat tetap dihitung hadir.
// Hari tanpa absen tidak ada barisnya, jadi otomatis tidak dibayar.
function hitung(baris) {
  const guru = baris.map((b) => {
    const totalPertemuan = b.hari_hadir * b.pertemuan_per_hari;
    return {
      id: b.id,
      nama: b.nama,
      aktif: b.aktif,
      hariHadir: b.hari_hadir,
      pertemuanPerHari: b.pertemuan_per_hari,
      totalPertemuan,
      tarif: b.tarif_per_pertemuan,
      gaji: totalPertemuan * b.tarif_per_pertemuan,
    };
  });
  return { guru, total: guru.reduce((n, g) => n + g.gaji, 0) };
}

router.get('/', async (req, res) => {
  const cek = skemaBulan.safeParse(req.query.bulan);
  if (!cek.success) {
    return res.status(400).json({ error: 'Format bulan harus YYYY-MM, contoh 2026-11' });
  }
  const data = hitung(await gajiBulan(req.sekolahId, cek.data + '-01'));
  res.set('Cache-Control', 'no-store');
  res.json({ bulan: cek.data, ...data });
});

router.get('/csv', async (req, res) => {
  const cek = skemaBulan.safeParse(req.query.bulan);
  if (!cek.success) {
    return res.status(400).json({ error: 'Format bulan harus YYYY-MM, contoh 2026-11' });
  }
  const bulan = cek.data;

  const s = await ambilPengaturan(req.sekolahId);
  if (!s) return res.status(401).json({ error: 'Belum login' });

  const { guru, total } = hitung(await gajiBulan(req.sekolahId, bulan + '-01'));
  const csv = buatCsv([
    ['Nama Guru', 'Hari Hadir', 'Pertemuan per Hari', 'Total Pertemuan', 'Tarif per Pertemuan (Rp)', 'Gaji (Rp)'],
    ...guru.map((g) => [g.nama, g.hariHadir, g.pertemuanPerHari, g.totalPertemuan, g.tarif, g.gaji]),
    ['TOTAL', '', '', '', '', total],
  ]);

  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="gaji-${s.slug}-${bulan}.csv"`,
    'Cache-Control': 'no-store',
  });
  res.send(csv);
});

router.put('/guru/:id', async (req, res) => {
  if (!/^\d{1,15}$/.test(req.params.id)) {
    return res.status(404).json({ error: 'Guru tidak ditemukan' });
  }
  const cek = z
    .object({
      pertemuanPerHari: z.number().int().min(0).max(MAKS_PERTEMUAN),
      tarif: z.number().int().min(0).max(MAKS_TARIF),
    })
    .strict()
    .safeParse(req.body);
  if (!cek.success) {
    return res.status(400).json({
      error: 'Pertemuan per hari 0 sampai 20 dan tarif 0 sampai 10.000.000, keduanya bilangan bulat',
    });
  }

  const g = await ubahTarifGuru(req.sekolahId, req.params.id, cek.data.pertemuanPerHari, cek.data.tarif);
  if (!g) return res.status(404).json({ error: 'Guru tidak ditemukan' });
  res.json({
    id: g.id,
    nama: g.nama,
    pertemuanPerHari: g.pertemuan_per_hari,
    tarif: g.tarif_per_pertemuan,
  });
});

module.exports = router;
