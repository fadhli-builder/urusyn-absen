const request = require('supertest');
const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { VERSI_PERSETUJUAN } = require('../src/services/persetujuan');
const { tanggalWIB } = require('../src/services/waktu');
const { resetDb, buatSekolah, tambahGuru } = require('./helpers');

const TITIK = { lat: -6.2, lng: 106.8, akurasi: 10 };
const JAUH = { lat: -6.2 + 0.009, lng: 106.8, akurasi: 10 }; // sekitar 1 km

async function loginGuru(slug, guruId) {
  const agent = request.agent(app);
  const res = await agent.post(`/api/s/${slug}/login`).send({ guruId: String(guruId), pin: '123456' });
  if (res.status !== 200) throw new Error('login guru gagal di tes');
  return agent;
}

const setuju = (id) =>
  query('UPDATE guru SET persetujuan_pada = now(), persetujuan_versi = $1 WHERE id = $2', [
    VERSI_PERSETUJUAN,
    id,
  ]);

const hitung = async (guruId) =>
  (await query('SELECT count(*)::int AS n FROM absensi WHERE guru_id = $1', [guruId])).rows[0].n;

describe('absen masuk', () => {
  let a1, a2, a3, b1;
  let agentA1, agentA2, agentA3, agentB1;

  beforeAll(async () => {
    await resetDb();
    const idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    const idB = await buatSekolah('sekolah-b', 'Sekolah B', 'passB-12345');
    await query(
      `UPDATE sekolah SET lat = -6.2, lng = 106.8, radius_m = 100, jam_masuk = '07:00',
       toleransi_menit = 10, akurasi_maks_m = 50, selfie_aktif = false WHERE id = $1`,
      [idA]
    );
    a1 = await tambahGuru(idA, 'Guru A1');
    a2 = await tambahGuru(idA, 'Guru A2');
    a3 = await tambahGuru(idA, 'Guru A3');
    b1 = await tambahGuru(idB, 'Guru B1');
    await setuju(a1);
    await setuju(a2);
    await setuju(b1);
    agentA1 = await loginGuru('sekolah-a', a1);
    agentA2 = await loginGuru('sekolah-a', a2);
    agentA3 = await loginGuru('sekolah-a', a3);
    agentB1 = await loginGuru('sekolah-b', b1);
  });

  afterAll(async () => {
    await pool.end();
  });

  test('tanpa login ditolak', async () => {
    const res = await request(app).post('/api/absen/masuk').send(TITIK);
    expect(res.status).toBe(401);
  });

  test('tanpa persetujuan ditolak', async () => {
    const res = await agentA3.post('/api/absen/masuk').send(TITIK);
    expect(res.status).toBe(403);
    expect(await hitung(a3)).toBe(0);
  });

  test('di titik sekolah berhasil dan tercatat dengan tanggal WIB', async () => {
    const res = await agentA1.post('/api/absen/masuk').send(TITIK);
    expect(res.status).toBe(201);
    expect(['hadir', 'telat']).toContain(res.body.status);
    expect(res.body.tanggal).toBe(tanggalWIB());
    expect(await hitung(a1)).toBe(1);
  });

  test('kirim dua kali: yang kedua 409 dan tidak menambah baris', async () => {
    const res = await agentA1.post('/api/absen/masuk').send(TITIK);
    expect(res.status).toBe(409);
    expect(await hitung(a1)).toBe(1);
  });

  test('1 km dari sekolah ditolak dan tidak tercatat', async () => {
    const res = await agentA2.post('/api/absen/masuk').send(JAUH);
    expect(res.status).toBe(422);
    expect(await hitung(a2)).toBe(0);
  });

  test('akurasi GPS di atas batas sekolah ditolak', async () => {
    const res = await agentA2.post('/api/absen/masuk').send({ ...TITIK, akurasi: 500 });
    expect(res.status).toBe(422);
    expect(await hitung(a2)).toBe(0);
  });

  test('body tidak valid ditolak 400', async () => {
    const res = await agentA2.post('/api/absen/masuk').send({ lat: 'abc', lng: 106.8, akurasi: 10 });
    expect(res.status).toBe(400);
    expect(await hitung(a2)).toBe(0);
  });

  test('guruId guru lain di body diabaikan: tetap tercatat atas nama sendiri', async () => {
    const res = await agentA2.post('/api/absen/masuk').send({ ...TITIK, guruId: String(a1) });
    expect(res.status).toBe(201);
    expect(await hitung(a2)).toBe(1);
    expect(await hitung(a1)).toBe(1); // guru A1 tidak bertambah
  });

  test('sekolah yang belum mengatur lokasi menolak dengan pesan jelas', async () => {
    const res = await agentB1.post('/api/absen/masuk').send(TITIK);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/belum selesai diatur/i);
  });
});
