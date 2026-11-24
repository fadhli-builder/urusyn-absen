const request = require('supertest');
const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { tanggalWIB } = require('../src/services/waktu');
const { resetDb, buatSekolah, tambahGuru, loginAgent } = require('./helpers');

const sisip = (sekolahId, guruId, tanggal, status) =>
  query(
    `INSERT INTO absensi (sekolah_id, guru_id, tanggal, jam_masuk, status, lat, lng)
     VALUES ($1, $2, $3, now(), $4, -6.2, 106.8)`,
    [sekolahId, guruId, tanggal, status]
  );

describe('rekap', () => {
  let adminA;
  let adminB;

  beforeAll(async () => {
    await resetDb();
    const idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    const idB = await buatSekolah('sekolah-b', 'Sekolah B', 'passB-12345');
    const g1 = await tambahGuru(idA, 'Guru 1');
    const g2 = await tambahGuru(idA, 'Guru 2');
    await tambahGuru(idA, 'Guru 3'); // tidak pernah absen
    const g4 = await tambahGuru(idA, 'Guru 4'); // nonaktif, tidak punya absen
    const g5 = await tambahGuru(idA, 'Guru 5'); // nonaktif, punya absen Maret 2025
    await query('UPDATE guru SET aktif = false WHERE id = ANY($1::bigint[])', [[g4, g5]]);
    const b1 = await tambahGuru(idB, 'Guru B1');

    const hariIni = tanggalWIB();
    await sisip(idA, g1, hariIni, 'hadir');
    await sisip(idA, g2, hariIni, 'telat');
    await sisip(idB, b1, hariIni, 'hadir');

    // Maret 2025 (31 hari). 28 Feb dan 1 April sengaja di luar bulan.
    await sisip(idA, g1, '2025-03-03', 'hadir');
    await sisip(idA, g1, '2025-03-04', 'telat');
    await sisip(idA, g1, '2025-02-28', 'hadir');
    await sisip(idA, g1, '2025-04-01', 'hadir');
    await sisip(idA, g5, '2025-03-10', 'hadir');
    await sisip(idB, b1, '2025-03-03', 'hadir');

    adminA = await loginAgent(app, 'sekolah-a', 'passA-12345');
    adminB = await loginAgent(app, 'sekolah-b', 'passB-12345');
  });

  afterAll(async () => {
    await pool.end();
  });

  const nama = (daftar) => daftar.map((x) => x.nama).sort();

  test('tanpa login ditolak', async () => {
    expect((await request(app).get('/api/rekap/hari-ini')).status).toBe(401);
    expect((await request(app).get('/api/rekap/bulan?bulan=2025-03')).status).toBe(401);
  });

  test('hari ini: hadir, telat, belum terbagi benar dan guru nonaktif tidak ikut', async () => {
    const res = await adminA.get('/api/rekap/hari-ini');
    expect(res.status).toBe(200);
    expect(res.body.tanggal).toBe(tanggalWIB());
    expect(nama(res.body.hadir)).toEqual(['Guru 1']);
    expect(nama(res.body.telat)).toEqual(['Guru 2']);
    expect(nama(res.body.belum)).toEqual(['Guru 3']);
    expect(res.body.ringkasan).toEqual({ total: 3, sudahAbsen: 2, telat: 1, belum: 1 });
  });

  test('hari ini: data sekolah lain tidak ikut', async () => {
    const res = await adminA.get('/api/rekap/hari-ini');
    const semua = [...res.body.hadir, ...res.body.telat, ...res.body.belum].map((x) => x.nama);
    expect(semua).not.toContain('Guru B1');

    const b = await adminB.get('/api/rekap/hari-ini');
    expect(nama(b.body.hadir)).toEqual(['Guru B1']);
    expect(b.body.ringkasan.total).toBe(1);
  });

  test('bulan: matriks benar dan absen di luar bulan tidak ikut', async () => {
    const res = await adminA.get('/api/rekap/bulan?bulan=2025-03');
    expect(res.status).toBe(200);
    expect(res.body.jumlahHari).toBe(31);

    const g1 = res.body.guru.find((g) => g.nama === 'Guru 1');
    expect(Object.keys(g1.hari).sort()).toEqual(['3', '4']);
    expect(g1.hari['3'].status).toBe('hadir');
    expect(g1.hari['4'].status).toBe('telat');
    expect(g1.hadir).toBe(1);
    expect(g1.telat).toBe(1);
  });

  test('bulan: guru nonaktif yang punya absen tetap tampil, yang tidak punya tidak', async () => {
    const res = await adminA.get('/api/rekap/bulan?bulan=2025-03');
    expect(res.body.guru.map((g) => g.nama)).toEqual(['Guru 1', 'Guru 2', 'Guru 3', 'Guru 5']);
    const g5 = res.body.guru.find((g) => g.nama === 'Guru 5');
    expect(g5.aktif).toBe(false);
  });

  test('bulan: data sekolah lain tidak ikut', async () => {
    const a = await adminA.get('/api/rekap/bulan?bulan=2025-03');
    expect(a.body.guru.map((g) => g.nama)).not.toContain('Guru B1');

    const b = await adminB.get('/api/rekap/bulan?bulan=2025-03');
    expect(b.body.guru.map((g) => g.nama)).toEqual(['Guru B1']);
    expect(Object.keys(b.body.guru[0].hari)).toEqual(['3']);
  });

  test('bulan: format salah atau kosong ditolak 400', async () => {
    for (const bulan of ['2025-13', '2025-1', 'abc', '2025-03-01', '1999-01', '2025-00']) {
      const res = await adminA.get('/api/rekap/bulan').query({ bulan });
      expect(res.status).toBe(400);
    }
    expect((await adminA.get('/api/rekap/bulan')).status).toBe(400);
  });

  test('bulan: jumlah hari benar untuk Februari kabisat dan November', async () => {
    expect((await adminA.get('/api/rekap/bulan?bulan=2028-02')).body.jumlahHari).toBe(29);
    expect((await adminA.get('/api/rekap/bulan?bulan=2026-11')).body.jumlahHari).toBe(30);
  });
});
