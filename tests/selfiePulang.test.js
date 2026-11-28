const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { VERSI_PERSETUJUAN } = require('../src/services/persetujuan');
const { folderUpload } = require('../src/services/uploads');
const { resetDb, buatSekolah, tambahGuru, loginAgent } = require('./helpers');

const PNG_AWAL = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const buatPng = (n) => Buffer.concat([PNG_AWAL, Buffer.from('isi-foto-' + n)]);

const kirim = (agent, jenis, foto, lokasi = { lat: '-6.2', lng: '106.8', akurasi: '10' }, nama = 'selfie.png', tipe = 'image/png') => {
  let r = agent
    .post('/api/absen/' + jenis)
    .field('lat', lokasi.lat)
    .field('lng', lokasi.lng)
    .field('akurasi', lokasi.akurasi);
  if (foto) r = r.attach('foto', foto, { filename: nama, contentType: tipe });
  return r;
};

async function loginGuru(slug, guruId) {
  const agent = request.agent(app);
  const res = await agent.post(`/api/s/${slug}/login`).send({ guruId: String(guruId), pin: '123456' });
  if (res.status !== 200) throw new Error('login guru gagal di tes');
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
  (
    await query(
      `SELECT id, foto_path, foto_hash, foto_pulang_path, foto_pulang_hash, jam_pulang
       FROM absensi WHERE guru_id = $1`,
      [guruId]
    )
  ).rows[0];

describe('selfie saat absen pulang', () => {
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
    g.c1 = await tambahGuru(idC, 'Guru C1');
    for (const id of Object.values(g)) await setuju(id);

    ag.a1 = await loginGuru('sekolah-a', g.a1);
    ag.a2 = await loginGuru('sekolah-a', g.a2);
    ag.a3 = await loginGuru('sekolah-a', g.a3);
    ag.c1 = await loginGuru('sekolah-c', g.c1);
    adminA = await loginAgent(app, 'sekolah-a', 'passA-12345');
    adminB = await loginAgent(app, 'sekolah-b', 'passB-12345');
  });

  afterAll(async () => {
    fs.rmSync(folderUpload(), { recursive: true, force: true });
    await pool.end();
  });

  test('absen masuk dengan foto 1 berhasil', async () => {
    expect((await kirim(ag.a1, 'masuk', buatPng(1))).status).toBe(201);
  });

  test('sekolah dengan selfie aktif: pulang tanpa foto ditolak dan tidak tercatat', async () => {
    const res = await kirim(ag.a1, 'pulang', null);
    expect(res.status).toBe(422);
    expect((await baris(g.a1)).jam_pulang).toBeNull();
  });

  test('foto pulang yang sama dengan foto masuk sendiri ditolak', async () => {
    const res = await kirim(ag.a1, 'pulang', buatPng(1));
    expect(res.status).toBe(409);
    expect((await baris(g.a1)).jam_pulang).toBeNull();
  });

  test('file teks yang berpura-pura jadi gambar ditolak saat pulang', async () => {
    const res = await kirim(ag.a1, 'pulang', Buffer.from('ini bukan gambar'), undefined, 'a.jpg', 'image/jpeg');
    expect(res.status).toBe(415);
  });

  test('foto pulang di atas 2 MB ditolak', async () => {
    const besar = Buffer.concat([PNG_AWAL, Buffer.alloc(2 * 1024 * 1024)]);
    const res = await kirim(ag.a1, 'pulang', besar);
    expect(res.status).toBe(413);
  });

  test('foto pulang yang berbeda diterima: file, hash, dan GPS tersimpan', async () => {
    const res = await kirim(ag.a1, 'pulang', buatPng(2));
    expect(res.status).toBe(200);
    const row = await baris(g.a1);
    expect(row.foto_pulang_path.startsWith(`${idA}/`)).toBe(true);
    expect(row.foto_pulang_hash).toHaveLength(64);
    expect(row.foto_pulang_path).not.toBe(row.foto_path);
    expect(fs.existsSync(path.join(folderUpload(), row.foto_pulang_path))).toBe(true);
    expect(row.jam_pulang).not.toBeNull();
  });

  test('foto pulang guru lain dipakai sebagai foto masuk ditolak (lintas masuk dan pulang)', async () => {
    const res = await kirim(ag.a2, 'masuk', buatPng(2));
    expect(res.status).toBe(409);
    expect(await baris(g.a2)).toBeUndefined();
  });

  test('pulang di luar radius ditolak sebelum foto disimpan (tidak ada file yatim)', async () => {
    expect((await kirim(ag.a3, 'masuk', buatPng(3))).status).toBe(201);
    const sebelum = fs.readdirSync(path.join(folderUpload(), String(idA))).length;

    const res = await kirim(ag.a3, 'pulang', buatPng(4), { lat: String(-6.2 + 0.009), lng: '106.8', akurasi: '10' });
    expect(res.status).toBe(422);
    expect(fs.readdirSync(path.join(folderUpload(), String(idA))).length).toBe(sebelum);
    expect((await baris(g.a3)).foto_pulang_path).toBeNull();
  });

  test('admin sekolah A bisa membuka foto masuk dan foto pulang', async () => {
    const row = await baris(g.a1);
    const pulang = await adminA.get(`/api/foto/${row.id}?jenis=pulang`);
    expect(pulang.status).toBe(200);
    expect(pulang.headers['content-type']).toMatch(/image\/png/);
    expect(Buffer.compare(pulang.body, buatPng(2))).toBe(0);

    const masuk = await adminA.get(`/api/foto/${row.id}?jenis=masuk`);
    expect(masuk.status).toBe(200);
    expect(Buffer.compare(masuk.body, buatPng(1))).toBe(0);

    const bawaan = await adminA.get(`/api/foto/${row.id}`); // tanpa jenis = masuk
    expect(Buffer.compare(bawaan.body, buatPng(1))).toBe(0);
  });

  test('admin sekolah B tidak bisa membuka foto pulang sekolah A', async () => {
    const row = await baris(g.a1);
    expect((await adminB.get(`/api/foto/${row.id}?jenis=pulang`)).status).toBe(404);
    expect((await adminB.get(`/api/foto/${row.id}?jenis=masuk`)).status).toBe(404);
  });

  test('jenis foto yang tidak dikenal, atau absen tanpa foto pulang, memberi 404', async () => {
    const row = await baris(g.a1);
    expect((await adminA.get(`/api/foto/${row.id}?jenis=ngawur`)).status).toBe(404);
    expect((await adminA.get(`/api/foto/${row.id}?jenis=pulang&jenis=masuk`)).status).toBe(404);
    const belumPulang = await baris(g.a3);
    expect((await adminA.get(`/api/foto/${belumPulang.id}?jenis=pulang`)).status).toBe(404);
  });

  test('tanpa login dan token guru tidak bisa membuka foto pulang', async () => {
    const row = await baris(g.a1);
    expect((await request(app).get(`/api/foto/${row.id}?jenis=pulang`)).status).toBe(401);
    expect((await ag.a1.get(`/api/foto/${row.id}?jenis=pulang`)).status).toBe(401);
  });

  test('sekolah dengan selfie mati: pulang tanpa foto berhasil dan foto_pulang_path kosong', async () => {
    expect((await kirim(ag.c1, 'masuk', null)).status).toBe(201);
    const res = await kirim(ag.c1, 'pulang', null);
    expect(res.status).toBe(200);
    const row = await baris(g.c1);
    expect(row.foto_pulang_path).toBeNull();
    expect(row.foto_pulang_hash).toBeNull();
    expect(row.jam_pulang).not.toBeNull();
  });
});
