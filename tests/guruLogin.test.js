const request = require('supertest');
const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { resetDb, buatSekolah, tambahGuru } = require('./helpers');

function ambilCookie(res, nama) {
  const c = (res.headers['set-cookie'] || []).find((x) => x.startsWith(nama + '='));
  return c ? c.split(';')[0].replace(nama + '=', '') : null;
}

describe('login guru lewat link sekolah', () => {
  let guruA;
  let guruNonaktif;

  beforeAll(async () => {
    await resetDb();
    const idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    const idB = await buatSekolah('sekolah-b', 'Sekolah B', 'passB-12345');
    guruA = await tambahGuru(idA, 'Guru A1');
    guruNonaktif = await tambahGuru(idA, 'Guru Nonaktif');
    await tambahGuru(idB, 'Guru B1');
    await query('UPDATE guru SET aktif = false WHERE id = $1', [guruNonaktif]);
  });

  afterAll(async () => {
    await pool.end();
  });

  const loginGuru = (slug, guruId, pin) =>
    request(app).post(`/api/s/${slug}/login`).send({ guruId: String(guruId), pin });

  test('daftar hanya berisi guru aktif milik sekolah itu', async () => {
    const res = await request(app).get('/api/s/sekolah-a/guru');
    expect(res.status).toBe(200);
    const nama = res.body.guru.map((g) => g.nama);
    expect(nama).toEqual(['Guru A1']);
  });

  test('slug yang tidak ada ditolak 404', async () => {
    const res = await request(app).get('/api/s/tidak-ada/guru');
    expect(res.status).toBe(404);
  });

  test('login benar memberi cookie token_guru dan profil terbaca', async () => {
    const res = await loginGuru('sekolah-a', guruA, '123456');
    expect(res.status).toBe(200);
    const token = ambilCookie(res, 'token_guru');
    expect(token).toBeTruthy();

    const profil = await request(app).get('/api/profil-guru').set('Cookie', `token_guru=${token}`);
    expect(profil.status).toBe(200);
    expect(profil.body.nama).toBe('Guru A1');
  });

  test('guru sekolah A tidak bisa login lewat link sekolah B', async () => {
    const res = await loginGuru('sekolah-b', guruA, '123456');
    expect(res.status).toBe(401);
  });

  test('PIN salah ditolak', async () => {
    const res = await loginGuru('sekolah-a', guruA, '000000');
    expect(res.status).toBe(401);
  });

  test('guru nonaktif tidak bisa login', async () => {
    const res = await loginGuru('sekolah-a', guruNonaktif, '123456');
    expect(res.status).toBe(401);
  });

  test('token guru tidak bisa dipakai di endpoint admin', async () => {
    const login = await loginGuru('sekolah-a', guruA, '123456');
    const token = ambilCookie(login, 'token_guru');

    const a = await request(app).get('/api/guru').set('Cookie', `token_guru=${token}`);
    expect(a.status).toBe(401);

    // dipaksa dipasang sebagai cookie admin pun tetap ditolak (peran bukan admin)
    const b = await request(app).get('/api/guru').set('Cookie', `token=${token}`);
    expect(b.status).toBe(401);
  });

  test('token admin tidak bisa dipakai di endpoint guru', async () => {
    const login = await request(app).post('/api/login').send({ sekolah: 'sekolah-a', password: 'passA-12345' });
    const tokenAdmin = ambilCookie(login, 'token');
    const res = await request(app).get('/api/profil-guru').set('Cookie', `token_guru=${tokenAdmin}`);
    expect(res.status).toBe(401);
  });
});
