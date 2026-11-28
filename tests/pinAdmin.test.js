const request = require('supertest');
const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { resetDb, buatSekolah, tambahGuru, loginAgent } = require('./helpers');

// koneksi database ditutup sekali, setelah SEMUA blok tes di file ini selesai
afterAll(async () => {
  await pool.end();
});

describe('PIN guru dibuat manual oleh admin', () => {
  let idA;
  let guruB;
  let adminA;
  let adminB;

  const loginGuru = (guruId, pin) =>
    request(app).post('/api/s/sekolah-a/login').send({ guruId: String(guruId), pin });
  const jumlahGuru = async () =>
    (await query('SELECT count(*)::int AS n FROM guru WHERE sekolah_id = $1', [idA])).rows[0].n;

  beforeAll(async () => {
    await resetDb();
    idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    const idB = await buatSekolah('sekolah-b', 'Sekolah B', 'passB-12345');
    guruB = await tambahGuru(idB, 'Guru B1');
    adminA = await loginAgent(app, 'sekolah-a', 'passA-12345');
    adminB = await loginAgent(app, 'sekolah-b', 'passB-12345');
  });

  test('guru dibuat dengan PIN pilihan admin: respons tanpa PIN dan guru bisa login dengan PIN itu', async () => {
    const res = await adminA.post('/api/guru').send({ nama: 'Bu Rina', pin: '482916' });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['aktif', 'id', 'nama']);
    expect(res.text).not.toContain('482916');

    const login = await loginGuru(res.body.id, '482916');
    expect(login.status).toBe(200);
  });

  test('PIN tersimpan sebagai hash bcrypt, bukan teks asli', async () => {
    const row = (await query("SELECT pin_hash FROM guru WHERE nama = 'Bu Rina'")).rows[0];
    expect(row.pin_hash).toMatch(/^\$2[aby]\$/);
    expect(row.pin_hash).not.toContain('482916');
  });

  test('PIN yang salah ditolak saat login', async () => {
    const id = (await query("SELECT id FROM guru WHERE nama = 'Bu Rina'")).rows[0].id;
    expect((await loginGuru(id, '482917')).status).toBe(401);
  });

  test('tanpa PIN, atau format salah, ditolak 400 dan guru tidak dibuat', async () => {
    const sebelum = await jumlahGuru();
    const kasus = [undefined, '', '12345', '1234567', 'abcdef', '48291a', '4829 6', 4829165];
    for (const pin of kasus) {
      const res = await adminA.post('/api/guru').send({ nama: 'Guru Gagal', pin });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/PIN/);
    }
    expect(await jumlahGuru()).toBe(sebelum);
  });

  test('PIN kembar atau berurutan ditolak karena terlalu mudah ditebak', async () => {
    const sebelum = await jumlahGuru();
    for (const pin of ['000000', '111111', '999999', '123456', '234567', '654321', '012345', '987654']) {
      const res = await adminA.post('/api/guru').send({ nama: 'Guru Mudah', pin });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/terlalu mudah/i);
    }
    expect(await jumlahGuru()).toBe(sebelum);
  });

  test('PIN biasa yang tidak berpola diterima', async () => {
    for (const [nama, pin] of [['Pak A', '135790'], ['Pak B', '102938'], ['Pak C', '555556']]) {
      expect((await adminA.post('/api/guru').send({ nama, pin })).status).toBe(201);
    }
  });

  test('nama kembar ditolak 409 walau PIN valid', async () => {
    const res = await adminA.post('/api/guru').send({ nama: 'Bu Rina', pin: '739104' });
    expect(res.status).toBe(409);
  });

  test('nama kosong ditolak 400 dengan pesan tentang nama', async () => {
    const res = await adminA.post('/api/guru').send({ nama: ' ', pin: '739104' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Nama/);
  });

  test('admin mengganti PIN: PIN lama mati, PIN baru berlaku', async () => {
    const id = (await query("SELECT id FROM guru WHERE nama = 'Bu Rina'")).rows[0].id;
    const res = await adminA.put(`/api/guru/${id}/pin`).send({ pin: '739104' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.text).not.toContain('739104');

    expect((await loginGuru(id, '482916')).status).toBe(401);
    expect((await loginGuru(id, '739104')).status).toBe(200);
  });

  test('mengganti PIN dengan PIN lemah ditolak dan PIN lama tetap berlaku', async () => {
    const id = (await query("SELECT id FROM guru WHERE nama = 'Bu Rina'")).rows[0].id;
    for (const pin of ['111111', '123456', '12', 'abcdef', undefined]) {
      expect((await adminA.put(`/api/guru/${id}/pin`).send({ pin })).status).toBe(400);
    }
    expect((await loginGuru(id, '739104')).status).toBe(200);
  });

  test('admin sekolah lain tidak bisa mengganti PIN guru ini, dan sebaliknya', async () => {
    const id = (await query("SELECT id FROM guru WHERE nama = 'Bu Rina'")).rows[0].id;
    const sebelum = (await query('SELECT pin_hash FROM guru WHERE id = $1', [id])).rows[0].pin_hash;
    expect((await adminB.put(`/api/guru/${id}/pin`).send({ pin: '864209' })).status).toBe(404);
    expect((await query('SELECT pin_hash FROM guru WHERE id = $1', [id])).rows[0].pin_hash).toBe(sebelum);

    const sebelumB = (await query('SELECT pin_hash FROM guru WHERE id = $1', [guruB])).rows[0].pin_hash;
    expect((await adminA.put(`/api/guru/${guruB}/pin`).send({ pin: '864209' })).status).toBe(404);
    expect((await query('SELECT pin_hash FROM guru WHERE id = $1', [guruB])).rows[0].pin_hash).toBe(sebelumB);
  });

  test('tanpa login ditolak, dan id yang bukan angka memberi 404', async () => {
    expect((await request(app).put('/api/guru/1/pin').send({ pin: '864209' })).status).toBe(401);
    expect((await request(app).post('/api/guru').send({ nama: 'X Y', pin: '864209' })).status).toBe(401);
    expect((await adminA.put('/api/guru/abc/pin').send({ pin: '864209' })).status).toBe(404);
  });

  test('endpoint reset PIN acak sudah tidak ada', async () => {
    const id = (await query("SELECT id FROM guru WHERE nama = 'Bu Rina'")).rows[0].id;
    const res = await adminA.post(`/api/guru/${id}/reset-pin`);
    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty('pin');
  });
});

describe('keluar guru (ganti guru di perangkat yang sama)', () => {
  let idG;
  let idC;

  beforeAll(async () => {
    await resetDb();
    idC = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    idG = await tambahGuru(idC, 'Guru 1'); // PIN seed '123456'
  });

  test('logout menghapus cookie, dan sesi lama tidak berlaku lagi', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/s/sekolah-a/login').send({ guruId: String(idG), pin: '123456' });
    expect(login.status).toBe(200);
    expect((await agent.get('/api/profil-guru')).status).toBe(200);

    const keluar = await agent.post('/api/s/sekolah-a/logout');
    expect(keluar.status).toBe(200);
    expect(keluar.body).toEqual({ ok: true });
    const cookie = keluar.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/token_guru=;/);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);

    expect((await agent.get('/api/profil-guru')).status).toBe(401);
  });

  test('logout tanpa sesi tetap berhasil', async () => {
    const res = await request(app).post('/api/s/sekolah-a/logout');
    expect(res.status).toBe(200);
  });

  test('setelah logout, guru lain bisa login di perangkat yang sama', async () => {
    const g2 = await tambahGuru(idC, 'Guru 2');
    const agent = request.agent(app);
    await agent.post('/api/s/sekolah-a/login').send({ guruId: String(idG), pin: '123456' });
    await agent.post('/api/s/sekolah-a/logout');
    const login = await agent.post('/api/s/sekolah-a/login').send({ guruId: String(g2), pin: '123456' });
    expect(login.status).toBe(200);
    const profil = await agent.get('/api/profil-guru');
    expect(profil.body.nama).toBe('Guru 2');
  });
});
