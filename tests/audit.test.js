const request = require('supertest');
const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { VERSI_PERSETUJUAN } = require('../src/services/persetujuan');
const { resetDb, buatSekolah, tambahGuru, loginAgent } = require('./helpers');

const TITIK = { lat: -6.2, lng: 106.8, akurasi: 10 };
// kata kunci yang tidak boleh muncul di respons API mana pun
const TERLARANG = /password_hash|pin_hash|"password"|\$2[aby]\$|jwt_secret/i;

const setuju = (id) =>
  query('UPDATE guru SET persetujuan_pada = now(), persetujuan_versi = $1 WHERE id = $2', [
    VERSI_PERSETUJUAN,
    id,
  ]);

async function loginGuru(slug, guruId) {
  const agent = request.agent(app);
  const res = await agent.post(`/api/s/${slug}/login`).send({ guruId: String(guruId), pin: '123456' });
  if (res.status !== 200) throw new Error('login guru gagal di tes');
  return agent;
}

const bersih = (res) => expect(res.text).not.toMatch(TERLARANG);

describe('audit keamanan', () => {
  let idA;
  let g = {};
  let ag = {};
  let adminA;
  let adminB;

  beforeAll(async () => {
    await resetDb();
    idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    const idB = await buatSekolah('sekolah-b', 'Sekolah B', 'passB-12345');
    await query(
      `UPDATE sekolah SET lat = -6.2, lng = 106.8, radius_m = 100, jam_masuk = '07:00',
       toleransi_menit = 10, akurasi_maks_m = 50, selfie_aktif = false
       WHERE id = ANY($1::bigint[])`,
      [[idA, idB]]
    );
    g.g1 = await tambahGuru(idA, 'Guru 1');
    g.g2 = await tambahGuru(idA, 'Guru 2');
    g.g3 = await tambahGuru(idA, 'Guru 3'); // sengaja tidak setuju
    g.g4 = await tambahGuru(idA, 'Guru 4');
    g.b1 = await tambahGuru(idB, 'Guru B1');
    for (const id of [g.g1, g.g2, g.g4, g.b1]) await setuju(id);

    ag.g1 = await loginGuru('sekolah-a', g.g1);
    ag.g2 = await loginGuru('sekolah-a', g.g2);
    ag.g3 = await loginGuru('sekolah-a', g.g3);
    ag.g4 = await loginGuru('sekolah-a', g.g4);
    adminA = await loginAgent(app, 'sekolah-a', 'passA-12345');
    adminB = await loginAgent(app, 'sekolah-b', 'passB-12345');
  });

  afterAll(async () => {
    await pool.end();
  });

  test('sekolah kedaluwarsa di tengah sesi: absen masuk dan pulang ditolak 403', async () => {
    await query("UPDATE sekolah SET berlaku_sampai = '2020-01-01' WHERE id = $1", [idA]);
    try {
      expect((await ag.g4.post('/api/absen/masuk').send(TITIK)).status).toBe(403);
      expect((await ag.g4.post('/api/absen/pulang')).status).toBe(403);
    } finally {
      await query('UPDATE sekolah SET berlaku_sampai = NULL WHERE id = $1', [idA]);
    }
  });

  test('sekolah dinonaktifkan di tengah sesi: absen ditolak 403', async () => {
    await query('UPDATE sekolah SET aktif = false WHERE id = $1', [idA]);
    try {
      expect((await ag.g4.post('/api/absen/masuk').send(TITIK)).status).toBe(403);
    } finally {
      await query('UPDATE sekolah SET aktif = true WHERE id = $1', [idA]);
    }
  });

  test('guru dinonaktifkan di tengah sesi: token lamanya tidak berguna lagi (401)', async () => {
    await query('UPDATE guru SET aktif = false WHERE id = $1', [g.g2]);
    expect((await ag.g2.post('/api/absen/masuk').send(TITIK)).status).toBe(401);
    expect((await ag.g2.get('/api/profil-guru')).status).toBe(401);
  });

  test('guru tanpa persetujuan tidak bisa absen masuk maupun pulang', async () => {
    expect((await ag.g3.post('/api/absen/masuk').send(TITIK)).status).toBe(403);
    expect((await ag.g3.post('/api/absen/pulang')).status).toBe(403);
  });

  test('absen sekolah A tidak muncul di rekap, csv, atau dashboard sekolah B', async () => {
    expect((await ag.g1.post('/api/absen/masuk').send(TITIK)).status).toBe(201);

    const a = await adminA.get('/api/rekap/hari-ini');
    expect(a.body.ringkasan.sudahAbsen).toBe(1);

    const b = await adminB.get('/api/rekap/hari-ini');
    expect(b.body.ringkasan.sudahAbsen).toBe(0);
    expect(JSON.stringify(b.body)).not.toContain('Guru 1');

    const bulan = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
    const csvB = await adminB.get('/api/rekap/csv?bulan=' + bulan);
    expect(csvB.text).not.toContain('Guru 1');
  });

  test('cookie sesi: HttpOnly dan SameSite=Strict untuk admin dan guru', async () => {
    const admin = await request(app).post('/api/login').send({ sekolah: 'sekolah-a', password: 'passA-12345' });
    const cAdmin = admin.headers['set-cookie'].join(';');
    expect(cAdmin).toMatch(/HttpOnly/i);
    expect(cAdmin).toMatch(/SameSite=Strict/i);

    const guru = await request(app).post('/api/s/sekolah-a/login').send({ guruId: String(g.g1), pin: '123456' });
    const cGuru = guru.headers['set-cookie'].join(';');
    expect(cGuru).toMatch(/HttpOnly/i);
    expect(cGuru).toMatch(/SameSite=Strict/i);
  });

  test('respons API admin tidak membocorkan password, hash, atau secret', async () => {
    const bulan = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
    const daftar = [
      await adminA.get('/api/saya'),
      await adminA.get('/api/pengaturan'),
      await adminA.get('/api/guru'),
      await adminA.get('/api/rekap/hari-ini'),
      await adminA.get('/api/rekap/bulan?bulan=' + bulan),
      await adminA.get('/api/rekap/csv?bulan=' + bulan),
      await adminA.patch(`/api/guru/${g.g4}`).send({ aktif: true }),
    ];
    daftar.forEach(bersih);
  });

  test('PIN hanya keluar sekali lewat pembuatan dan reset, tanpa hash', async () => {
    const baru = await adminA.post('/api/guru').send({ nama: 'Guru Baru' });
    expect(baru.status).toBe(201);
    expect(Object.keys(baru.body).sort()).toEqual(['aktif', 'id', 'nama', 'pin']);
    expect(baru.body.pin).toMatch(/^\d{6}$/);
    bersih(baru);

    const reset = await adminA.post(`/api/guru/${g.g4}/reset-pin`);
    expect(Object.keys(reset.body)).toEqual(['pin']);
    bersih(reset);

    const daftar = await adminA.get('/api/guru');
    expect(daftar.text).not.toContain(baru.body.pin); // PIN tidak muncul lagi setelah itu
  });

  test('respons API guru tidak membocorkan password, hash, atau PIN guru lain', async () => {
    const daftar = [
      await request(app).get('/api/s/sekolah-a/guru'),
      await ag.g1.get('/api/profil-guru'),
      await ag.g1.get('/api/persetujuan'),
      await ag.g1.get('/api/absen/hari-ini'),
      await ag.g1.post('/api/absen/pulang'),
    ];
    daftar.forEach(bersih);
  });
});
