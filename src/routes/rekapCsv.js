const express = require('express');
const { z } = require('zod');
const { absensiBulanDetail } = require('../db/rekapCsv');
const { ambilPengaturan } = require('../db/sekolah');
const { buatCsv } = require('../services/csv');

const router = express.Router();
const skemaBulan = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);

const jamWIB = (waktu) =>
  waktu
    ? new Date(waktu).toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
    : '';

router.get('/csv', async (req, res) => {
  const cek = skemaBulan.safeParse(req.query.bulan);
  if (!cek.success) {
    return res.status(400).json({ error: 'Format bulan harus YYYY-MM, contoh 2026-11' });
  }
  const bulan = cek.data;

  const s = await ambilPengaturan(req.sekolahId);
  if (!s) return res.status(401).json({ error: 'Belum login' });

  const baris = await absensiBulanDetail(req.sekolahId, bulan + '-01');
  const csv = buatCsv([
    ['Nama Guru', 'Tanggal', 'Status', 'Jam Masuk (WIB)', 'Jam Pulang (WIB)'],
    ...baris.map((b) => [
      b.nama,
      b.tanggal,
      b.status === 'telat' ? 'Telat' : 'Hadir',
      jamWIB(b.jam_masuk),
      jamWIB(b.jam_pulang),
    ]),
  ]);

  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="rekap-${s.slug}-${bulan}.csv"`,
    'Cache-Control': 'no-store',
  });
  res.send(csv);
});

module.exports = router;
