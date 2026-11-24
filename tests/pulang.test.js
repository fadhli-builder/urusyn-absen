const request = require('supertest');
const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { VERSI_PERSETUJUAN } = require('../src/services/persetujuan');
const { resetDb, buatSekolah, tambahGuru } = require('./helpers');

const TITIK = { lat: -6.2, lng: 106.8, akurasi: 10 };

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
  (await query('SELECT jam_masuk, jam_pulang FROM absensi WHERE guru_id = $1', [guruId])).rows[0];

describe('absen pulang', () => {
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
    g.a1 = await tambahGuru(idA, 'Guru A1');
    g.a2 = await tambahGuru(idA, 'Guru A2');
    g.a3 = await tambahGuru(idA, 'Guru A3');
    g.a4 = await tambahGuru(idA, 'Guru A4');
    await setuju(g.a1);
    await setuju(g.a2);
    await setuju(g.a3); // a4 sengaja belum setuju
    for (const k of Object.keys(g)) ag[k] = await loginGuru(g[k]);
  });

  afterAll(async () => {
    await pool.end();
  });

  test('tanpa login ditolak', async () => {
    const res = await request(app).post('/api/absen/pulang');
    expect(res.status).toBe(401);
  });

  test('tanpa persetujuan ditolak', async () => {
    const res = await ag.a4.post('/api/absen/pulang');
    expect(res.status).toBe(403);
  });

  test('pulang tanpa masuk ditolak dan tidak membuat baris', async () => {
    const res = await ag.a3.post('/api/absen/pulang');
    expect(res.status).toBe(409);
    expect(await ambil(g.a3)).toBeUndefined();
  });

  test('masuk lalu pulang berhasil, jam_pulang terisi', async () => {
    expect((await ag.a1.post('/api/absen/masuk').send(TITIK)).status).toBe(201);
    const res = await ag.a1.post('/api/absen/pulang');
    expect(res.status).toBe(200);
    const row = await ambil(g.a1);
    expect(row.jam_pulang).not.toBeNull();
    expect(row.jam_pulang.getTime()).toBeGreaterThanOrEqual(row.jam_masuk.getTime());
  });

  test('pulang kedua ditolak dan jam_pulang tidak berubah', async () => {
    const sebelum = (await ambil(g.a1)).jam_pulang.getTime();
    const res = await ag.a1.post('/api/absen/pulang');
    expect(res.status).toBe(409);
    expect((await ambil(g.a1)).jam_pulang.getTime()).toBe(sebelum);
  });

  test('guruId guru lain di body diabaikan', async () => {
    expect((await ag.a2.post('/api/absen/masuk').send(TITIK)).status).toBe(201);

    // A1 sudah pulang. Dia mencoba memulangkan A2 lewat body: ditolak, A2 tetap belum pulang.
    const res = await ag.a1.post('/api/absen/pulang').send({ guruId: String(g.a2) });
    expect(res.status).toBe(409);
    expect((await ambil(g.a2)).jam_pulang).toBeNull();

    // A2 pulang sendiri lewat tokennya: berhasil
    expect((await ag.a2.post('/api/absen/pulang')).status).toBe(200);
    expect((await ambil(g.a2)).jam_pulang).not.toBeNull();
  });
});
