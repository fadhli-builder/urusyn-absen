const request = require('supertest');
const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { resetDb, buatSekolah, tambahGuru, loginAgent } = require('./helpers');

const sisip = (sekolahId, guruId, tanggal, status) =>
  query(
    `INSERT INTO absensi (sekolah_id, guru_id, tanggal, jam_masuk, status, lat, lng)
     VALUES ($1, $2, $3, now(), $4, -6.2, 106.8)`,
    [sekolahId, guruId, tanggal, status]
  );

describe('gaji', () => {
  let adminA;
  let adminB;
  let g1;
  let g2;
  let gNonaktifAda;
  let gNonaktifKosong;
  let gRumus;
  let b1;

  beforeAll(async () => {
    await resetDb();
    const idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    const idB = await buatSekolah('sekolah-b', 'Sekolah B', 'passB-12345');
    g1 = await tambahGuru(idA, 'Guru 1');
    g2 = await tambahGuru(idA, 'Guru 2');
    gNonaktifAda = await tambahGuru(idA, 'Guru Pindah');
    gNonaktifKosong = await tambahGuru(idA, 'Guru Lama');
    gRumus = await tambahGuru(idA, '=HYPERLINK("x")');
    b1 = await tambahGuru(idB, 'Guru B1');
    await query('UPDATE guru SET aktif = false WHERE id = ANY($1::bigint[])', [
      [gNonaktifAda, gNonaktifKosong],
    ]);

    // Maret 2025: g1 3 hadir + 1 telat (4 hari). 28 Feb dan 1 April di luar bulan.
    await sisip(idA, g1, '2025-03-03', 'hadir');
    await sisip(idA, g1, '2025-03-04', 'hadir');
    await sisip(idA, g1, '2025-03-05', 'hadir');
    await sisip(idA, g1, '2025-03-06', 'telat');
    await sisip(idA, g1, '2025-02-28', 'hadir');
    await sisip(idA, g1, '2025-04-01', 'hadir');
    await sisip(idA, g2, '2025-03-03', 'hadir');
    await sisip(idA, gNonaktifAda, '2025-03-10', 'hadir');
    await sisip(idB, b1, '2025-03-03', 'hadir');

    adminA = await loginAgent(app, 'sekolah-a', 'passA-12345');
    adminB = await loginAgent(app, 'sekolah-b', 'passB-12345');
  });

  afterAll(async () => {
    await pool.end();
  });

  const cari = (d, id) => d.guru.find((x) => String(x.id) === String(id));
  const simpan = (agen, id, badan) => agen.put(`/api/gaji/guru/${id}`).send(badan);

  test('tanpa login ditolak', async () => {
    expect((await request(app).get('/api/gaji?bulan=2025-03')).status).toBe(401);
    expect((await request(app).get('/api/gaji/csv?bulan=2025-03')).status).toBe(401);
    expect(
      (await request(app).put(`/api/gaji/guru/${g1}`).send({ pertemuanPerHari: 4, tarif: 1000 })).status
    ).toBe(401);
  });

  test('format bulan salah ditolak 400', async () => {
    for (const b of ['', '2025-13', '2025-3', 'maret', '1999-01']) {
      expect((await adminA.get('/api/gaji?bulan=' + b)).status).toBe(400);
      expect((await adminA.get('/api/gaji/csv?bulan=' + b)).status).toBe(400);
    }
  });

  test('sebelum diatur, tarif dan pertemuan 0 sehingga gaji 0', async () => {
    const res = await adminA.get('/api/gaji?bulan=2025-03');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(cari(res.body, g1)).toMatchObject({ hariHadir: 4, pertemuanPerHari: 0, tarif: 0, gaji: 0 });
    expect(res.body.total).toBe(0);
  });

  test('rumus: hari hadir x pertemuan per hari x tarif, telat tetap dihitung, luar bulan tidak', async () => {
    expect((await simpan(adminA, g1, { pertemuanPerHari: 4, tarif: 60000 })).status).toBe(200);
    expect((await simpan(adminA, g2, { pertemuanPerHari: 3, tarif: 50000 })).status).toBe(200);
    expect((await simpan(adminA, gNonaktifAda, { pertemuanPerHari: 2, tarif: 40000 })).status).toBe(200);

    const res = await adminA.get('/api/gaji?bulan=2025-03');
    // g1: 4 hari x 4 = 16 pertemuan x 60000 = 960000
    expect(cari(res.body, g1)).toMatchObject({
      hariHadir: 4,
      pertemuanPerHari: 4,
      totalPertemuan: 16,
      tarif: 60000,
      gaji: 960000,
    });
    // g2: 1 x 3 x 50000 = 150000
    expect(cari(res.body, g2).gaji).toBe(150000);
    // nonaktif yang punya absen ikut: 1 x 2 x 40000 = 80000
    expect(cari(res.body, gNonaktifAda).gaji).toBe(80000);
    expect(res.body.total).toBe(960000 + 150000 + 80000);
  });

  test('guru nonaktif tanpa absen di bulan itu tidak muncul; guru aktif tanpa absen muncul dengan gaji 0', async () => {
    const res = await adminA.get('/api/gaji?bulan=2025-03');
    expect(cari(res.body, gNonaktifKosong)).toBeUndefined();
    expect(cari(res.body, gRumus)).toMatchObject({ hariHadir: 0, gaji: 0 });
  });

  test('bulan berbeda dihitung terpisah', async () => {
    const feb = await adminA.get('/api/gaji?bulan=2025-02');
    expect(cari(feb.body, g1)).toMatchObject({ hariHadir: 1, totalPertemuan: 4, gaji: 240000 });
    const apr = await adminA.get('/api/gaji?bulan=2025-04');
    expect(cari(apr.body, g1)).toMatchObject({ hariHadir: 1, gaji: 240000 });
  });

  test('validasi input: pecahan, negatif, teks, terlalu besar, field asing ditolak 400', async () => {
    const salah = [
      { pertemuanPerHari: 1.5, tarif: 1000 },
      { pertemuanPerHari: -1, tarif: 1000 },
      { pertemuanPerHari: 4, tarif: -5 },
      { pertemuanPerHari: '4', tarif: 1000 },
      { pertemuanPerHari: 21, tarif: 1000 },
      { pertemuanPerHari: 4, tarif: 10000001 },
      { pertemuanPerHari: 4 },
      { tarif: 1000 },
      { pertemuanPerHari: 4, tarif: 1000, aktif: false },
      {},
    ];
    for (const badan of salah) {
      expect((await simpan(adminA, g1, badan)).status).toBe(400);
    }
    // nilai g1 tidak berubah oleh percobaan yang salah
    const res = await adminA.get('/api/gaji?bulan=2025-03');
    expect(cari(res.body, g1)).toMatchObject({ pertemuanPerHari: 4, tarif: 60000 });
  });

  test('batas atas yang sah diterima', async () => {
    expect((await simpan(adminA, g2, { pertemuanPerHari: 20, tarif: 10000000 })).status).toBe(200);
    expect((await simpan(adminA, g2, { pertemuanPerHari: 0, tarif: 0 })).status).toBe(200);
    expect((await simpan(adminA, g2, { pertemuanPerHari: 3, tarif: 50000 })).status).toBe(200);
  });

  test('id guru tidak valid atau tidak ada ditolak 404', async () => {
    const badan = { pertemuanPerHari: 1, tarif: 1000 };
    for (const id of ['abc', '1;DROP', '99999999999999999999', '999999']) {
      expect((await simpan(adminA, id, badan)).status).toBe(404);
    }
  });

  test('isolasi sekolah: admin B tidak bisa mengubah atau melihat guru sekolah A', async () => {
    const coba = await simpan(adminB, g1, { pertemuanPerHari: 20, tarif: 10000000 });
    expect(coba.status).toBe(404);

    const resA = await adminA.get('/api/gaji?bulan=2025-03');
    expect(cari(resA.body, g1)).toMatchObject({ pertemuanPerHari: 4, tarif: 60000 });

    const resB = await adminB.get('/api/gaji?bulan=2025-03');
    expect(resB.body.guru.map((x) => x.nama)).toEqual(['Guru B1']);
    expect(resB.body.total).toBe(0);
    expect(JSON.stringify(resB.body)).not.toMatch(/Guru 1|Guru 2/);
  });

  test('CSV: isi, total, nama berbahaya dinetralkan, header unduhan', async () => {
    const res = await adminA.get('/api/gaji/csv?bulan=2025-03');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain('gaji-sekolah-a-2025-03.csv');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text.startsWith('\uFEFF')).toBe(true);
    expect(res.text).toContain('Guru 1,4,4,16,60000,960000');
    expect(res.text).toContain('TOTAL,,,,,1190000');
    // nama berawalan = diberi awalan ' (CSV injection)
    expect(res.text).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(res.text).not.toContain('Guru B1');
  });

  test('CSV sekolah lain tidak membawa data sekolah A', async () => {
    const res = await adminB.get('/api/gaji/csv?bulan=2025-03');
    expect(res.text).toContain('Guru B1');
    expect(res.text).not.toContain('Guru 1,');
  });

  test('respons tidak membocorkan hash atau rahasia', async () => {
    const res = await adminA.get('/api/gaji?bulan=2025-03');
    expect(res.text).not.toMatch(/password_hash|pin_hash|\$2[aby]\$|jwt_secret/i);
  });
});
