const request = require('supertest');
const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { VERSI_PERSETUJUAN } = require('../src/services/persetujuan');
const { tanggalWIB } = require('../src/services/waktu');
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

describe('status hari ini dan profil guru', () => {
  let ag1;
  let ag2;

  beforeAll(async () => {
    await resetDb();
    const idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    await query(
      `UPDATE sekolah SET lat = -6.2, lng = 106.8, radius_m = 100, jam_masuk = '07:00',
       toleransi_menit = 10, akurasi_maks_m = 50, selfie_aktif = false WHERE id = $1`,
      [idA]
    );
    const g1 = await tambahGuru(idA, 'Guru 1');
    const g2 = await tambahGuru(idA, 'Guru 2');
    await setuju(g1);
    await setuju(g2);
    ag1 = await loginGuru(g1);
    ag2 = await loginGuru(g2);
  });

  afterAll(async () => {
    await pool.end();
  });

  test('tanpa login ditolak', async () => {
    const res = await request(app).get('/api/absen/hari-ini');
    expect(res.status).toBe(401);
  });

  test('profil guru memuat slug sekolahnya', async () => {
    const res = await ag1.get('/api/profil-guru');
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('sekolah-a');
    expect(res.body.nama).toBe('Guru 1');
  });

  test('sebelum absen: masuk dan pulang kosong, tanggal WIB', async () => {
    const res = await ag1.get('/api/absen/hari-ini');
    expect(res.status).toBe(200);
    expect(res.body.masuk).toBeNull();
    expect(res.body.pulang).toBeNull();
    expect(res.body.selfieAktif).toBe(false);
    expect(res.body.tanggal).toBe(tanggalWIB());
  });

  test('setelah masuk: status tercatat, pulang masih kosong', async () => {
    expect((await ag1.post('/api/absen/masuk').send(TITIK)).status).toBe(201);
    const res = await ag1.get('/api/absen/hari-ini');
    expect(['hadir', 'telat']).toContain(res.body.masuk.status);
    expect(res.body.pulang).toBeNull();
  });

  test('setelah pulang: pulang terisi', async () => {
    expect((await ag1.post('/api/absen/pulang').send(TITIK)).status).toBe(200);
    const res = await ag1.get('/api/absen/hari-ini');
    expect(res.body.pulang).not.toBeNull();
  });

  test('guru lain tidak melihat absen milik guru yang berbeda', async () => {
    const res = await ag2.get('/api/absen/hari-ini');
    expect(res.body.masuk).toBeNull();
  });
});
