const request = require('supertest');
const app = require('../src/app');
const { query, pool } = require('../src/db/query');
const { aman } = require('../src/services/csv');
const { resetDb, buatSekolah, tambahGuru, loginAgent } = require('./helpers');

const sisip = (sekolahId, guruId, tanggal, status) =>
  query(
    `INSERT INTO absensi (sekolah_id, guru_id, tanggal, jam_masuk, status, lat, lng)
     VALUES ($1, $2, $3, now(), $4, -6.2, 106.8)`,
    [sekolahId, guruId, tanggal, status]
  );

describe('aman() mencegah CSV injection', () => {
  test.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\t=1', '\r=1'])('awalan berbahaya %j diberi petik', (s) => {
    expect(aman(s).replace(/^"/, '').startsWith("'")).toBe(true);
  });

  test('teks biasa tidak diubah', () => {
    expect(aman('Budi Santoso')).toBe('Budi Santoso');
  });

  test('koma, kutip, dan baris baru dibungkus dengan benar', () => {
    expect(aman('a,b')).toBe('"a,b"');
    expect(aman('dia "bilang"')).toBe('"dia ""bilang"""');
    expect(aman('a\nb')).toBe('"a\nb"');
  });

  test('null dan undefined jadi kosong', () => {
    expect(aman(null)).toBe('');
    expect(aman(undefined)).toBe('');
  });
});

describe('endpoint csv', () => {
  let adminA;
  let adminB;

  beforeAll(async () => {
    await resetDb();
    const idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    const idB = await buatSekolah('sekolah-b', 'Sekolah B', 'passB-12345');
    const g1 = await tambahGuru(idA, 'Guru 1');
    const gRumus = await tambahGuru(idA, '=1+1');
    const b1 = await tambahGuru(idB, 'Guru B1');
    await sisip(idA, g1, '2025-03-03', 'hadir');
    await sisip(idA, g1, '2025-03-04', 'telat');
    await sisip(idA, gRumus, '2025-03-05', 'hadir');
    await sisip(idA, g1, '2025-04-01', 'hadir'); // luar bulan
    await sisip(idB, b1, '2025-03-03', 'hadir');
    adminA = await loginAgent(app, 'sekolah-a', 'passA-12345');
    adminB = await loginAgent(app, 'sekolah-b', 'passB-12345');
  });

  afterAll(async () => {
    await pool.end();
  });

  test('tanpa login ditolak', async () => {
    expect((await request(app).get('/api/rekap/csv?bulan=2025-03')).status).toBe(401);
  });

  test('format bulan salah ditolak 400', async () => {
    expect((await adminA.get('/api/rekap/csv?bulan=2025-13')).status).toBe(400);
    expect((await adminA.get('/api/rekap/csv')).status).toBe(400);
  });

  test('header, BOM, dan isi benar', async () => {
    const res = await adminA.get('/api/rekap/csv?bulan=2025-03');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain('rekap-sekolah-a-2025-03.csv');
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain('Nama Guru,Tanggal,Status,Jam Masuk (WIB),Jam Pulang (WIB)');
    expect(res.text).toContain('Guru 1,2025-03-03,Hadir,');
    expect(res.text).toContain('Guru 1,2025-03-04,Telat,');
    expect(res.text).not.toContain('2025-04-01');
  });

  test('nama guru berawalan rumus dinetralkan', async () => {
    const res = await adminA.get('/api/rekap/csv?bulan=2025-03');
    expect(res.text).toContain("'=1+1,2025-03-05");
    expect(res.text).not.toMatch(/(^|\n)=1\+1/);
  });

  test('data sekolah lain tidak ikut', async () => {
    const a = await adminA.get('/api/rekap/csv?bulan=2025-03');
    expect(a.text).not.toContain('Guru B1');
    const b = await adminB.get('/api/rekap/csv?bulan=2025-03');
    expect(b.text).toContain('Guru B1');
    expect(b.text).not.toContain('Guru 1,');
  });
});
