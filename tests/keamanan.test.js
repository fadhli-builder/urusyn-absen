const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { resetDb, buatSekolah, tambahGuru, loginAgent } = require('./helpers');

async function ambilToken(slug, password) {
  const res = await request(app).post('/api/login').send({ sekolah: slug, password });
  return res.headers['set-cookie'][0].split(';')[0].replace('token=', '');
}

describe('keamanan tambahan', () => {
  let idA;
  let idB;
  let agentA;
  let tokenA;

  beforeAll(async () => {
    await resetDb();
    idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    idB = await buatSekolah('sekolah-b', 'Sekolah B', 'passB-12345');
    await tambahGuru(idA, 'Guru A1');
    agentA = await loginAgent(app, 'sekolah-a', 'passA-12345');
    tokenA = await ambilToken('sekolah-a', 'passA-12345');
  });

  afterAll(async () => {
    await pool.end();
  });

  test('sekolah_id palsu di body PUT pengaturan diabaikan', async () => {
    const res = await agentA.put('/api/pengaturan').send({ radius_m: 123, sekolah_id: idB });
    expect(res.status).toBe(200);

    const a = await query('SELECT radius_m FROM sekolah WHERE id = $1', [idA]);
    const b = await query('SELECT radius_m FROM sekolah WHERE id = $1', [idB]);
    expect(a.rows[0].radius_m).toBe(123);
    expect(b.rows[0].radius_m).toBeNull(); // sekolah B tidak tersentuh
  });

  test('sekolah_id palsu di body POST guru diabaikan', async () => {
    const res = await agentA.post('/api/guru').send({ nama: 'Guru Baru', sekolah_id: idB });
    expect(res.status).toBe(201);

    const cek = await query('SELECT sekolah_id FROM guru WHERE id = $1', [res.body.id]);
    expect(cek.rows[0].sekolah_id).toBe(String(idA)); // masuk ke sekolah A, bukan B
  });

  test('tanpa cookie ditolak', async () => {
    const res = await request(app).get('/api/guru');
    expect(res.status).toBe(401);
  });

  test('cookie asal-asalan ditolak', async () => {
    const res = await request(app).get('/api/guru').set('Cookie', 'token=abc.def.ghi');
    expect(res.status).toBe(401);
  });

  test('cookie dengan tanda tangan diubah ditolak', async () => {
    const rusak = tokenA.slice(0, -1) + (tokenA.slice(-1) === 'A' ? 'B' : 'A');
    const res = await request(app).get('/api/guru').set('Cookie', `token=${rusak}`);
    expect(res.status).toBe(401);
  });

  test('cookie yang isinya diganti jadi sekolah B ditolak', async () => {
    const bagian = tokenA.split('.');
    const isi = JSON.parse(Buffer.from(bagian[1], 'base64url').toString());
    isi.sekolahId = String(idB);
    bagian[1] = Buffer.from(JSON.stringify(isi)).toString('base64url');

    const res = await request(app).get('/api/guru').set('Cookie', `token=${bagian.join('.')}`);
    expect(res.status).toBe(401);
  });

  test('token bertanda tangan secret lain ditolak', async () => {
    const palsu = jwt.sign({ sekolahId: String(idA), peran: 'admin' }, 'secret-palsu', { expiresIn: '1h' });
    const res = await request(app).get('/api/guru').set('Cookie', `token=${palsu}`);
    expect(res.status).toBe(401);
  });

  test('token kedaluwarsa ditolak', async () => {
    const lewat = jwt.sign({ sekolahId: String(idA), peran: 'admin' }, process.env.JWT_SECRET, { expiresIn: -10 });
    const res = await request(app).get('/api/guru').set('Cookie', `token=${lewat}`);
    expect(res.status).toBe(401);
  });

  test('sekolah dengan langganan kedaluwarsa ditolak login', async () => {
    const id = await buatSekolah('sekolah-lewat', 'Sekolah Lewat', 'passC-12345');
    await query('UPDATE sekolah SET berlaku_sampai = $1 WHERE id = $2', ['2020-01-01', id]);
    const res = await request(app).post('/api/login').send({ sekolah: 'sekolah-lewat', password: 'passC-12345' });
    expect(res.status).toBe(403);
  });

  test('sekolah nonaktif ditolak login', async () => {
    const id = await buatSekolah('sekolah-mati', 'Sekolah Mati', 'passE-12345');
    await query('UPDATE sekolah SET aktif = $1 WHERE id = $2', [false, id]);
    const res = await request(app).post('/api/login').send({ sekolah: 'sekolah-mati', password: 'passE-12345' });
    expect(res.status).toBe(403);
  });

  test('selama harus_ganti_password true, endpoint admin ditolak', async () => {
    const id = await buatSekolah('sekolah-baru', 'Sekolah Baru', 'passD-12345');
    await query('UPDATE akun_admin SET harus_ganti_password = $1 WHERE sekolah_id = $2', [true, id]);
    const agent = await loginAgent(app, 'sekolah-baru', 'passD-12345');
    const res = await agent.get('/api/guru');
    expect(res.status).toBe(403);
  });
});
