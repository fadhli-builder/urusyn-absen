const fs = require('fs');
const path = require('path');
const { query, pool } = require('../src/db/query');
const { folderUpload } = require('../src/services/uploads');
const { siapkanFoto } = require('../src/services/fotoAbsen');
const { fotoSudahAda } = require('../src/db/absensi');
const { resetDb, buatSekolah, tambahGuru } = require('./helpers');

const PNG_AWAL = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (n) => Buffer.concat([PNG_AWAL, Buffer.from('isi-' + n)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('isi-jpg')]);
const belumAda = async () => false;
const sudahAda = async () => true;

const jumlahFile = (sekolahId) => {
  const dir = path.join(folderUpload(), String(sekolahId));
  return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
};

afterAll(async () => {
  fs.rmSync(folderUpload(), { recursive: true, force: true });
  await pool.end();
});

describe('fotoSudahAda: foto yang sama tidak boleh dipakai ulang (masuk maupun pulang)', () => {
  let idA;
  let idB;

  beforeAll(async () => {
    await resetDb();
    idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    idB = await buatSekolah('sekolah-b', 'Sekolah B', 'passB-12345');
    const g = await tambahGuru(idA, 'Guru 1');
    await query(
      `INSERT INTO absensi (sekolah_id, guru_id, tanggal, jam_masuk, status, lat, lng,
         foto_path, foto_hash, foto_pulang_path, foto_pulang_hash)
       VALUES ($1, $2, current_date, now(), 'hadir', -6.2, 106.8, 'x/m.png', 'hash-masuk', 'x/p.png', 'hash-pulang')`,
      [idA, g]
    );
  });

  test('hash foto masuk dikenali', async () => {
    expect(await fotoSudahAda(idA, 'hash-masuk')).toBe(true);
  });

  test('hash foto pulang juga dikenali', async () => {
    expect(await fotoSudahAda(idA, 'hash-pulang')).toBe(true);
  });

  test('hash yang belum pernah dipakai: tidak ada', async () => {
    expect(await fotoSudahAda(idA, 'hash-lain')).toBe(false);
  });

  test('hash milik sekolah lain tidak ikut terhitung', async () => {
    expect(await fotoSudahAda(idB, 'hash-masuk')).toBe(false);
    expect(await fotoSudahAda(idB, 'hash-pulang')).toBe(false);
  });
});

describe('siapkanFoto: validasi dan penyimpanan selfie', () => {
  const sekolahId = 77;

  test('tanpa file: 422', async () => {
    const r = await siapkanFoto({}, sekolahId, belumAda);
    expect(r.galat.status).toBe(422);
  });

  test('file teks berpura-pura jadi gambar: 415 dan tidak ada file tersimpan', async () => {
    const r = await siapkanFoto({ file: { buffer: Buffer.from('ini bukan gambar') } }, sekolahId, belumAda);
    expect(r.galat.status).toBe(415);
    expect(jumlahFile(sekolahId)).toBe(0);
  });

  test('PNG valid: file tersimpan di folder sekolah, hash 64 karakter', async () => {
    const r = await siapkanFoto({ file: { buffer: png(1) } }, sekolahId, belumAda);
    expect(r.galat).toBeUndefined();
    expect(r.fotoPath.startsWith(sekolahId + '/')).toBe(true);
    expect(r.fotoPath.endsWith('.png')).toBe(true);
    expect(r.fotoHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.existsSync(path.join(folderUpload(), r.fotoPath))).toBe(true);
  });

  test('JPEG dikenali dari isinya', async () => {
    const r = await siapkanFoto({ file: { buffer: jpg } }, sekolahId, belumAda);
    expect(r.fotoPath.endsWith('.jpg')).toBe(true);
  });

  test('foto yang sudah pernah dipakai: 409 dan tidak ada file baru', async () => {
    const sebelum = jumlahFile(sekolahId);
    const r = await siapkanFoto({ file: { buffer: png(2) } }, sekolahId, sudahAda);
    expect(r.galat.status).toBe(409);
    expect(jumlahFile(sekolahId)).toBe(sebelum);
  });
});
