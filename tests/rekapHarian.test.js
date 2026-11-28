const request = require('supertest');
const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { tanggalWIB } = require('../src/services/waktu');
const { resetDb, buatSekolah, tambahGuru, loginAgent } = require('./helpers');

const TANGGAL = '2025-03-03';

const sisip = (d) =>
  query(
    `INSERT INTO absensi (sekolah_id, guru_id, tanggal, jam_masuk, jam_pulang, status,
       lat, lng, akurasi_m, lat_pulang, lng_pulang, akurasi_pulang_m,
       foto_path, foto_hash, foto_pulang_path, foto_pulang_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      d.sekolahId, d.guruId, d.tanggal, d.masuk, d.pulang ?? null, d.status,
      d.lat ?? -6.2, d.lng ?? 106.8, d.akurasi ?? 12,
      d.latPulang ?? null, d.lngPulang ?? null, d.akurasiPulang ?? null,
      d.fotoMasuk ?? null, d.fotoMasuk ? 'h-' + d.guruId + '-m' : null,
      d.fotoPulang ?? null, d.fotoPulang ? 'h-' + d.guruId + '-p' : null,
    ]
  );

describe('rekap harian dan riwayat per tanggal', () => {
  let adminA;
  let adminB;

  beforeAll(async () => {
    await resetDb();
    const idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    const idB = await buatSekolah('sekolah-b', 'Sekolah B', 'passB-12345');
    await query('UPDATE sekolah SET lat = -6.2, lng = 106.8 WHERE id = ANY($1::bigint[])', [[idA, idB]]);

    const g1 = await tambahGuru(idA, 'Guru 1');
    const g2 = await tambahGuru(idA, 'Guru 2');
    await tambahGuru(idA, 'Guru 3'); // tidak absen
    const g4 = await tambahGuru(idA, 'Guru 4'); // nonaktif sekarang, tapi absen pada tanggal itu
    const g5 = await tambahGuru(idA, 'Guru 5'); // nonaktif, tidak absen
    await query('UPDATE guru SET aktif = false WHERE id = ANY($1::bigint[])', [[g4, g5]]);
    const b1 = await tambahGuru(idB, 'Guru B1');

    // Guru 1: masuk dan pulang lengkap dengan foto. Pulang sekitar 100 m dari sekolah.
    await sisip({
      sekolahId: idA, guruId: g1, tanggal: TANGGAL, status: 'hadir',
      masuk: '2025-03-03T00:05:00Z', pulang: '2025-03-03T08:00:00Z',
      latPulang: -6.2 + 0.0009, lngPulang: 106.8, akurasiPulang: 20,
      fotoMasuk: 'x/m1.png', fotoPulang: 'x/p1.png',
    });
    // Guru 2: telat, belum pulang, tanpa foto
    await sisip({ sekolahId: idA, guruId: g2, tanggal: TANGGAL, status: 'telat', masuk: '2025-03-03T01:30:00Z' });
    // Guru 4 (nonaktif): hadir pada tanggal itu
    await sisip({ sekolahId: idA, guruId: g4, tanggal: TANGGAL, status: 'hadir', masuk: '2025-03-03T00:00:00Z' });
    // Sekolah B pada tanggal yang sama
    await sisip({ sekolahId: idB, guruId: b1, tanggal: TANGGAL, status: 'hadir', masuk: '2025-03-03T00:00:00Z' });

    adminA = await loginAgent(app, 'sekolah-a', 'passA-12345');
    adminB = await loginAgent(app, 'sekolah-b', 'passB-12345');
  });

  afterAll(async () => {
    await pool.end();
  });

  const nama = (daftar) => daftar.map((x) => x.nama).sort();

  test('tanpa login ditolak', async () => {
    expect((await request(app).get('/api/rekap/harian?tanggal=' + TANGGAL)).status).toBe(401);
  });

  test('tanggal tidak valid ditolak 400', async () => {
    for (const tanggal of ['2025-02-30', '2025-13-01', '2025-00-10', 'abc', '2025-3-3', '1999-01-01', '2025-03-03x']) {
      const res = await adminA.get('/api/rekap/harian').query({ tanggal });
      expect(res.status).toBe(400);
    }
    expect((await adminA.get('/api/rekap/harian')).status).toBe(400);
    expect((await adminA.get('/api/rekap/harian?tanggal=2025-03-03&tanggal=2025-03-04')).status).toBe(400);
  });

  test('tanggal di masa depan ditolak 400', async () => {
    const res = await adminA.get('/api/rekap/harian?tanggal=2099-01-01');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/masa depan/i);
  });

  test('riwayat: yang hadir, telat, dan tidak absen pada tanggal itu terbagi benar', async () => {
    const res = await adminA.get('/api/rekap/harian?tanggal=' + TANGGAL);
    expect(res.status).toBe(200);
    expect(res.body.tanggal).toBe(TANGGAL);
    expect(res.body.hariIni).toBe(false);
    expect(nama(res.body.hadir)).toEqual(['Guru 1', 'Guru 4']); // Guru 4 nonaktif tapi punya absen: tetap tampil
    expect(nama(res.body.telat)).toEqual(['Guru 2']);
    expect(nama(res.body.belum)).toEqual(['Guru 3']); // Guru 5 nonaktif tanpa absen: tidak ikut
    expect(res.body.ringkasan).toEqual({ total: 4, sudahAbsen: 3, telat: 1, belum: 1 });
  });

  test('flag foto dan lokasi masuk serta pulang benar', async () => {
    const res = await adminA.get('/api/rekap/harian?tanggal=' + TANGGAL);
    const g1 = res.body.hadir.find((x) => x.nama === 'Guru 1');
    expect(g1.fotoMasuk).toBe(true);
    expect(g1.fotoPulang).toBe(true);
    expect(g1.lokasiMasuk.jarakM).toBe(0);
    expect(g1.lokasiMasuk.akurasiM).toBe(12);
    expect(g1.lokasiPulang.jarakM).toBeGreaterThanOrEqual(99);
    expect(g1.lokasiPulang.jarakM).toBeLessThanOrEqual(101);
    expect(g1.lokasiPulang.akurasiM).toBe(20);

    const g2 = res.body.telat.find((x) => x.nama === 'Guru 2');
    expect(g2.fotoMasuk).toBe(false);
    expect(g2.fotoPulang).toBe(false);
    expect(g2.lokasiPulang).toBeNull();
    expect(g2.jamPulang).toBeNull();
  });

  test('data sekolah lain tidak ikut di riwayat', async () => {
    const a = await adminA.get('/api/rekap/harian?tanggal=' + TANGGAL);
    const semuaA = [...a.body.hadir, ...a.body.telat, ...a.body.belum].map((x) => x.nama);
    expect(semuaA).not.toContain('Guru B1');

    const b = await adminB.get('/api/rekap/harian?tanggal=' + TANGGAL);
    expect(nama(b.body.hadir)).toEqual(['Guru B1']);
    expect(b.body.ringkasan.total).toBe(1);
  });

  test('tanggal hari ini lewat /harian sama dengan /hari-ini', async () => {
    const hariIni = tanggalWIB();
    const a = await adminA.get('/api/rekap/harian?tanggal=' + hariIni);
    const b = await adminA.get('/api/rekap/hari-ini');
    expect(a.status).toBe(200);
    expect(a.body.hariIni).toBe(true);
    expect(b.body.hariIni).toBe(true);
    expect(a.body).toEqual(b.body);
  });

  test('tanggal tanpa absen sama sekali: semua guru aktif masuk daftar tidak absen', async () => {
    const res = await adminA.get('/api/rekap/harian?tanggal=2025-03-04');
    expect(res.status).toBe(200);
    expect(res.body.hadir).toHaveLength(0);
    expect(nama(res.body.belum)).toEqual(['Guru 1', 'Guru 2', 'Guru 3']);
  });
});
