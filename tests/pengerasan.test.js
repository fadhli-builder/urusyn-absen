const request = require('supertest');
const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { VERSI_PERSETUJUAN } = require('../src/services/persetujuan');
const { resetDb, buatSekolah, tambahGuru, loginAgent } = require('./helpers');

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

describe('pengerasan', () => {
  let adminA;
  let agentG1;
  let agentG2;

  beforeAll(async () => {
    await resetDb();
    const idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    const g1 = await tambahGuru(idA, 'Guru 1');
    const g2 = await tambahGuru(idA, 'Guru 2');
    await setuju(g1);
    await setuju(g2);
    adminA = await loginAgent(app, 'sekolah-a', 'passA-12345');
    agentG1 = await loginGuru(g1);
    agentG2 = await loginGuru(g2);
  });

  afterAll(async () => {
    await pool.end();
  });

  test('header keamanan terpasang dan X-Powered-By hilang', async () => {
    const res = await request(app).get('/');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('same-origin');
    expect(res.headers['permissions-policy']).toContain('geolocation=(self)');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('header keamanan juga ada di respons API', async () => {
    const res = await request(app).get('/api/guru');
    expect(res.status).toBe(401);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('endpoint API yang tidak ada: 404 JSON', async () => {
    const res = await request(app).get('/api/tidak-ada');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  test('JSON rusak: 400 tanpa detail internal', async () => {
    const res = await request(app)
      .post('/api/login')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/SyntaxError|node_modules|\bat /);
  });

  test('error internal: klien hanya dapat pesan umum, detail hanya di log server', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest
      .spyOn(pool, 'query')
      .mockRejectedValueOnce(new Error('rahasia: password=hunter2 host=10.0.0.5'));

    const res = await adminA.get('/api/saya');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Terjadi kesalahan di server' });
    const teks = JSON.stringify(res.body) + res.text;
    expect(teks).not.toMatch(/hunter2|10\.0\.0\.5|stack|node_modules/);
    expect(log).toHaveBeenCalled(); // detailnya tercatat di sisi server

    pool.query.mockRestore();
    log.mockRestore();
  });

  test('rate limit absen: request ke-21 ditolak 429, GET status tidak ikut dihitung', async () => {
    const kirim = () =>
      agentG1.post('/api/absen/masuk').send({ lat: 'bukan-angka', lng: 106.8, akurasi: 10 });

    for (let i = 0; i < 20; i += 1) {
      const res = await kirim();
      expect(res.status).toBe(400);
    }
    expect((await kirim()).status).toBe(429);
    expect((await agentG1.get('/api/absen/hari-ini')).status).toBe(200);
  });

  test('rate limit absen dihitung per guru: guru lain tidak ikut terblokir', async () => {
    const res = await agentG2
      .post('/api/absen/masuk')
      .send({ lat: 'bukan-angka', lng: 106.8, akurasi: 10 });
    expect(res.status).toBe(400);
  });
});
