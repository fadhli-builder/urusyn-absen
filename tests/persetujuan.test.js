const request = require('supertest');
const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { resetDb, buatSekolah, tambahGuru } = require('./helpers');

describe('persetujuan guru', () => {
  let guruA;
  let guruB;
  let agent;

  beforeAll(async () => {
    await resetDb();
    const idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    const idB = await buatSekolah('sekolah-b', 'Sekolah B', 'passB-12345');
    guruA = await tambahGuru(idA, 'Guru A1');
    guruB = await tambahGuru(idB, 'Guru B1');
    agent = request.agent(app);
    const res = await agent
      .post('/api/s/sekolah-a/login')
      .send({ guruId: String(guruA), pin: '123456' });
    if (res.status !== 200) throw new Error('login guru gagal di tes');
  });

  afterAll(async () => {
    await pool.end();
  });

  test('tanpa login ditolak', async () => {
    const res = await request(app).get('/api/absen/siap');
    expect(res.status).toBe(401);
  });

  test('sebelum setuju, absen ditolak', async () => {
    const res = await agent.get('/api/absen/siap');
    expect(res.status).toBe(403);
    expect(res.body.perluPersetujuan).toBe(true);
  });

  test('GET persetujuan memberi teks, versi, dan status belum setuju', async () => {
    const res = await agent.get('/api/persetujuan');
    expect(res.status).toBe(200);
    expect(res.body.sudah).toBe(false);
    expect(res.body.versi).toBeTruthy();
    expect(res.body.teks.poin.length).toBeGreaterThan(0);
  });

  test('setuju=false atau versi salah ditolak', async () => {
    const a = await agent.post('/api/persetujuan').send({ setuju: false, versi: '2026-11-v1' });
    expect(a.status).toBe(400);
    const b = await agent.post('/api/persetujuan').send({ setuju: true, versi: 'versi-ngawur' });
    expect(b.status).toBe(400);
  });

  test('setelah setuju, absen diizinkan dan waktu serta versi tercatat', async () => {
    const info = await agent.get('/api/persetujuan');
    const res = await agent.post('/api/persetujuan').send({ setuju: true, versi: info.body.versi });
    expect(res.status).toBe(200);

    const siap = await agent.get('/api/absen/siap');
    expect(siap.status).toBe(200);

    const db = await query('SELECT persetujuan_pada, persetujuan_versi FROM guru WHERE id = $1', [guruA]);
    expect(db.rows[0].persetujuan_pada).not.toBeNull();
    expect(db.rows[0].persetujuan_versi).toBe(info.body.versi);
  });

  test('kalau versi teks berubah, guru harus setuju lagi', async () => {
    await query("UPDATE guru SET persetujuan_versi = 'versi-lama' WHERE id = $1", [guruA]);
    const res = await agent.get('/api/absen/siap');
    expect(res.status).toBe(403);
  });

  test('persetujuan guru A tidak mengubah guru B', async () => {
    const db = await query('SELECT persetujuan_pada FROM guru WHERE id = $1', [guruB]);
    expect(db.rows[0].persetujuan_pada).toBeNull();
  });
});
