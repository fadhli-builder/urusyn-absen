const request = require('supertest');
const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { VERSI_PERSETUJUAN } = require('../src/services/persetujuan');
const { resetDb, buatSekolah, tambahGuru } = require('./helpers');

const TITIK = { lat: -6.2, lng: 106.8, akurasi: 10 };
const JAUH = { lat: -6.2 + 0.009, lng: 106.8, akurasi: 10 }; // sekitar 1 km

async function loginGuru(guruId) {
  const agent = request.agent(app);
  const res = await agent.post('/api/s/sekolah-a/login').send({ guruId: String(guruId), pin: '123456' });
  if (res.status !== 200) throw new Error('login guru gagal di tes');
  return agent;
}

const setuju = (id) =>
  query('UPDATE guru SET persetujuan_pada = now(), persetujuan_versi = $1 WHERE id = $2', [
    VERSI_PERSETUJUAN,
    id,
  ]);

const ambil = async (guruId) =>
  (
    await query(
      `SELECT jam_masuk, jam_pulang, lat_pulang, lng_pulang, akurasi_pulang_m
       FROM absensi WHERE guru_id = $1`,
      [guruId]
    )
  ).rows[0];

describe('absen pulang (GPS, aturan sama dengan absen masuk)', () => {
  let g = {};
  let ag = {};

  beforeAll(async () => {
    await resetDb();
    const idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    await query(
      `UPDATE sekolah SET lat = -6.2, lng = 106.8, radius_m = 100, jam_masuk = '07:00',
       toleransi_menit = 10, akurasi_maks_m = 50, selfie_aktif = false WHERE id = $1`,
      [idA]
    );
    for (const k of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']) g[k] = await tambahGuru(idA, 'Guru ' + k);
    for (const k of ['a1', 'a2', 'a3', 'a5', 'a6']) await setuju(g[k]); // a4 sengaja belum setuju
    for (const k of Object.keys(g)) ag[k] = await loginGuru(g[k]);
  });

  afterAll(async () => {
    await pool.end();
  });

  test('tanpa login ditolak', async () => {
    const res = await request(app).post('/api/absen/pulang').send(TITIK);
    expect(res.status).toBe(401);
  });

  test('tanpa persetujuan ditolak', async () => {
    const res = await ag.a4.post('/api/absen/pulang').send(TITIK);
    expect(res.status).toBe(403);
  });

  test('pulang tanpa lokasi ditolak 400', async () => {
    expect((await ag.a3.post('/api/absen/pulang')).status).toBe(400);
    expect((await ag.a3.post('/api/absen/pulang').send({ lat: 'x', lng: 106.8, akurasi: 10 })).status).toBe(400);
  });

  test('pulang tanpa masuk ditolak dan tidak membuat baris', async () => {
    const res = await ag.a3.post('/api/absen/pulang').send(TITIK);
    expect(res.status).toBe(409);
    expect(await ambil(g.a3)).toBeUndefined();
  });

  test('masuk lalu pulang berhasil: jam dan GPS pulang tersimpan', async () => {
    expect((await ag.a1.post('/api/absen/masuk').send(TITIK)).status).toBe(201);
    const res = await ag.a1.post('/api/absen/pulang').send(TITIK);
    expect(res.status).toBe(200);
    expect(res.body.jarak_m).toBeGreaterThanOrEqual(0);

    const row = await ambil(g.a1);
    expect(row.jam_pulang).not.toBeNull();
    expect(row.jam_pulang.getTime()).toBeGreaterThanOrEqual(row.jam_masuk.getTime());
    expect(row.lat_pulang).toBeCloseTo(-6.2, 6);
    expect(row.lng_pulang).toBeCloseTo(106.8, 6);
    expect(row.akurasi_pulang_m).toBe(10);
  });

  test('pulang kedua ditolak dan data pulang tidak berubah', async () => {
    const sebelum = await ambil(g.a1);
    const res = await ag.a1.post('/api/absen/pulang').send({ lat: -6.2001, lng: 106.8001, akurasi: 5 });
    expect(res.status).toBe(409);
    const sesudah = await ambil(g.a1);
    expect(sesudah.jam_pulang.getTime()).toBe(sebelum.jam_pulang.getTime());
    expect(sesudah.lat_pulang).toBe(sebelum.lat_pulang);
  });

  test('pulang di luar radius sekolah ditolak dan tidak tercatat', async () => {
    expect((await ag.a2.post('/api/absen/masuk').send(TITIK)).status).toBe(201);
    const res = await ag.a2.post('/api/absen/pulang').send(JAUH);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/luar area sekolah/i);
    const row = await ambil(g.a2);
    expect(row.jam_pulang).toBeNull();
    expect(row.lat_pulang).toBeNull();
  });

  test('pulang dengan akurasi GPS di atas batas sekolah ditolak', async () => {
    const res = await ag.a2.post('/api/absen/pulang').send({ ...TITIK, akurasi: 500 });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/kurang akurat/i);
    expect((await ambil(g.a2)).jam_pulang).toBeNull();
  });

  test('setelah ditolak, pulang di titik sekolah tetap bisa dicoba lagi', async () => {
    const res = await ag.a2.post('/api/absen/pulang').send(TITIK);
    expect(res.status).toBe(200);
    expect((await ambil(g.a2)).jam_pulang).not.toBeNull();
  });

  test('guruId guru lain di body diabaikan', async () => {
    expect((await ag.a5.post('/api/absen/masuk').send(TITIK)).status).toBe(201);

    // a1 sudah pulang. Dia mencoba memulangkan a5 lewat body: ditolak, a5 tetap belum pulang.
    const res = await ag.a1.post('/api/absen/pulang').send({ ...TITIK, guruId: String(g.a5) });
    expect(res.status).toBe(409);
    expect((await ambil(g.a5)).jam_pulang).toBeNull();

    expect((await ag.a5.post('/api/absen/pulang').send(TITIK)).status).toBe(200);
  });

  test('sekolah yang belum mengatur lokasi: pulang ditolak dengan pesan jelas', async () => {
    expect((await ag.a6.post('/api/absen/masuk').send(TITIK)).status).toBe(201);
    await query('UPDATE sekolah SET lat = NULL, lng = NULL WHERE slug = $1', ['sekolah-a']);
    try {
      const res = await ag.a6.post('/api/absen/pulang').send(TITIK);
      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/belum selesai diatur/i);
    } finally {
      await query('UPDATE sekolah SET lat = -6.2, lng = 106.8 WHERE slug = $1', ['sekolah-a']);
    }
  });
});
