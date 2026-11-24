const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { VERSI_PERSETUJUAN } = require('../src/services/persetujuan');
const { folderUpload } = require('../src/services/uploads');
const { resetDb, buatSekolah, tambahGuru } = require('./helpers');

const PNG_AWAL = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const buatPng = (n) => Buffer.concat([PNG_AWAL, Buffer.from('isi-foto-' + n)]);

const kirim = (agent, foto, nama = 'selfie.png', tipe = 'image/png') => {
  let r = agent
    .post('/api/absen/masuk')
    .field('lat', '-6.2')
    .field('lng', '106.8')
    .field('akurasi', '10');
  if (foto) r = r.attach('foto', foto, { filename: nama, contentType: tipe });
  return r;
};

async function loginGuru(slug, guruId) {
  const agent = request.agent(app);
  const res = await agent.post(`/api/s/${slug}/login`).send({ guruId: String(guruId), pin: '123456' });
  if (res.status !== 200) throw new Error('login guru gagal di tes');
  return agent;
}

async function loginAdmin(slug, password) {
  const agent = request.agent(app);
  const res = await agent.post('/api/login').send({ sekolah: slug, password });
  if (res.status !== 200) throw new Error('login admin gagal di tes');
  return agent;
}

const atur = (id, selfie) =>
  query(
    `UPDATE sekolah SET lat = -6.2, lng = 106.8, radius_m = 100, jam_masuk = '07:00',
     toleransi_menit = 10, akurasi_maks_m = 50, selfie_aktif = $2 WHERE id = $1`,
    [id, selfie]
  );

const setuju = (id) =>
  query('UPDATE guru SET persetujuan_pada = now(), persetujuan_versi = $1 WHERE id = $2', [
    VERSI_PERSETUJUAN,
    id,
  ]);

const baris = async (guruId) =>
  (await query('SELECT id, foto_path, foto_hash FROM absensi WHERE guru_id = $1', [guruId])).rows;

describe('selfie', () => {
  let idA;
  let g = {};
  let ag = {};
  let adminA;
  let adminB;

  beforeAll(async () => {
    await resetDb();
    idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    const idB = await buatSekolah('sekolah-b', 'Sekolah B', 'passB-12345');
    const idC = await buatSekolah('sekolah-c', 'Sekolah C', 'passC-12345');
    await atur(idA, true);
    await atur(idB, true);
    await atur(idC, false);

    g.a1 = await tambahGuru(idA, 'Guru A1');
    g.a2 = await tambahGuru(idA, 'Guru A2');
    g.a3 = await tambahGuru(idA, 'Guru A3');
    g.a4 = await tambahGuru(idA, 'Guru A4');
    g.b1 = await tambahGuru(idB, 'Guru B1');
    g.c1 = await tambahGuru(idC, 'Guru C1');
    for (const id of Object.values(g)) await setuju(id);

    ag.a1 = await loginGuru('sekolah-a', g.a1);
    ag.a2 = await loginGuru('sekolah-a', g.a2);
    ag.a3 = await loginGuru('sekolah-a', g.a3);
    ag.a4 = await loginGuru('sekolah-a', g.a4);
    ag.b1 = await loginGuru('sekolah-b', g.b1);
    ag.c1 = await loginGuru('sekolah-c', g.c1);
    adminA = await loginAdmin('sekolah-a', 'passA-12345');
    adminB = await loginAdmin('sekolah-b', 'passB-12345');
  });

  afterAll(async () => {
    fs.rmSync(folderUpload(), { recursive: true, force: true });
    await pool.end();
  });

  test('sekolah dengan selfie aktif: tanpa foto ditolak dan tidak tercatat', async () => {
    const res = await kirim(ag.a3, null);
    expect(res.status).toBe(422);
    expect(await baris(g.a3)).toHaveLength(0);
  });

  test('foto PNG valid diterima, file tersimpan di folder sekolah, hash tercatat', async () => {
    const res = await kirim(ag.a1, buatPng(1));
    expect(res.status).toBe(201);
    const [row] = await baris(g.a1);
    expect(row.foto_path.startsWith(`${idA}/`)).toBe(true);
    expect(row.foto_hash).toHaveLength(64);
    expect(fs.existsSync(path.join(folderUpload(), row.foto_path))).toBe(true);
  });

  test('file teks yang berpura-pura jadi gambar ditolak', async () => {
    const res = await kirim(ag.a3, Buffer.from('ini bukan gambar'), 'a.jpg', 'image/jpeg');
    expect(res.status).toBe(415);
    expect(await baris(g.a3)).toHaveLength(0);
  });

  test('foto di atas 2 MB ditolak', async () => {
    const besar = Buffer.concat([PNG_AWAL, Buffer.alloc(2 * 1024 * 1024)]);
    const res = await kirim(ag.a3, besar);
    expect(res.status).toBe(413);
    expect(await baris(g.a3)).toHaveLength(0);
  });

  test('foto identik dipakai guru lain di sekolah yang sama ditolak', async () => {
    const res = await kirim(ag.a2, buatPng(1));
    expect(res.status).toBe(409);
    expect(await baris(g.a2)).toHaveLength(0);
  });

  test('foto yang berbeda diterima', async () => {
    const res = await kirim(ag.a2, buatPng(2));
    expect(res.status).toBe(201);
  });

  test('admin sekolah A bisa membuka foto absen sekolahnya', async () => {
    const [row] = await baris(g.a1);
    const res = await adminA.get(`/api/foto/${row.id}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
  });

  test('admin sekolah B tidak bisa membuka foto sekolah A lewat id tebakan', async () => {
    const [row] = await baris(g.a1);
    const res = await adminB.get(`/api/foto/${row.id}`);
    expect(res.status).toBe(404);
  });

  test('tanpa login dan token guru tidak bisa membuka foto', async () => {
    const [row] = await baris(g.a1);
    expect((await request(app).get(`/api/foto/${row.id}`)).status).toBe(401);
    expect((await ag.a1.get(`/api/foto/${row.id}`)).status).toBe(401);
  });

  test('folder uploads tidak disajikan langsung lewat URL', async () => {
    const [row] = await baris(g.a1);
    const res = await request(app).get(`/uploads/${row.foto_path}`);
    expect(res.status).toBe(404);
  });

  test('sekolah dengan selfie mati: foto tidak diminta dan foto_path kosong', async () => {
    const res = await kirim(ag.c1, null);
    expect(res.status).toBe(201);
    const [row] = await baris(g.c1);
    expect(row.foto_path).toBeNull();
    expect(row.foto_hash).toBeNull();
  });
});
