const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { resetDb, buatSekolah, tambahGuru, loginAgent } = require('./helpers');

describe('isolasi guru antar sekolah', () => {
  let agentA;
  let guruA;
  let guruB;

  beforeAll(async () => {
    await resetDb();
    const sekolahA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    const sekolahB = await buatSekolah('sekolah-b', 'Sekolah B', 'passB-12345');
    guruA = await tambahGuru(sekolahA, 'Guru A1');
    guruB = await tambahGuru(sekolahB, 'Guru B1');
    agentA = await loginAgent(app, 'sekolah-a', 'passA-12345');
  });

  afterAll(async () => {
    await pool.end();
  });

  test('admin A hanya melihat guru sekolahnya sendiri', async () => {
    const res = await agentA.get('/api/guru');
    expect(res.status).toBe(200);
    const nama = res.body.map((g) => g.nama);
    expect(nama).toContain('Guru A1');
    expect(nama).not.toContain('Guru B1');
  });

  test('admin A tidak bisa menonaktifkan guru sekolah B', async () => {
    const res = await agentA.patch(`/api/guru/${guruB}`).send({ aktif: false });
    expect(res.status).toBe(404);

    const cek = await query('SELECT aktif FROM guru WHERE id = $1', [guruB]);
    expect(cek.rows[0].aktif).toBe(true); // data guru B tidak berubah
  });

  test('admin A tidak bisa mereset PIN guru sekolah B', async () => {
    const sebelum = await query('SELECT pin_hash FROM guru WHERE id = $1', [guruB]);

    const res = await agentA.put(`/api/guru/${guruB}/pin`).send({ pin: '482916' });
    expect(res.status).toBe(404);

    const sesudah = await query('SELECT pin_hash FROM guru WHERE id = $1', [guruB]);
    expect(sesudah.rows[0].pin_hash).toBe(sebelum.rows[0].pin_hash);
  });

  test('admin A bisa menonaktifkan guru sekolahnya sendiri (kontrol)', async () => {
    const res = await agentA.patch(`/api/guru/${guruA}`).send({ aktif: false });
    expect(res.status).toBe(200);
    expect(res.body.aktif).toBe(false);
  });
});