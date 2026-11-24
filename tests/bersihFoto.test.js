const fs = require('fs');
const path = require('path');
const { query, pool } = require('../src/db/query');
const { folderUpload } = require('../src/services/uploads');
const { bersihkanFoto } = require('../src/services/bersihkanFoto');
const { resetDb, buatSekolah, tambahGuru } = require('./helpers');

function tulis(relatif) {
  const penuh = path.join(folderUpload(), relatif);
  fs.mkdirSync(path.dirname(penuh), { recursive: true });
  fs.writeFileSync(penuh, 'isi-foto');
  return penuh;
}

describe('bersihkan foto', () => {
  let idA;
  let fileLama;
  let fileBaru;

  const sisip = (guruId, hari, relatif, hash) =>
    query(
      `INSERT INTO absensi (sekolah_id, guru_id, tanggal, jam_masuk, status, lat, lng, foto_path, foto_hash)
       VALUES ($1, $2, current_date, now() - ($3::int * interval '1 day'), 'hadir', -6.2, 106.8, $4, $5)`,
      [idA, guruId, hari, relatif, hash]
    );

  const ambil = async (hash) =>
    (await query('SELECT foto_path, foto_hash FROM absensi WHERE sekolah_id = $1 AND guru_id = $2', [idA, hash])).rows[0];

  let g = {};

  beforeAll(async () => {
    await resetDb();
    idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    g.lama = await tambahGuru(idA, 'Guru Lama');
    g.baru = await tambahGuru(idA, 'Guru Baru');
    g.hilang = await tambahGuru(idA, 'Guru Hilang');

    fileLama = tulis(`${idA}/lama.png`);
    fileBaru = tulis(`${idA}/baru.png`);
    // 'hilang': baris punya foto_path tapi filenya sudah tidak ada di disk

    await sisip(g.lama, 100, `${idA}/lama.png`, 'hash-lama');
    await sisip(g.baru, 2, `${idA}/baru.png`, 'hash-baru');
    await sisip(g.hilang, 120, `${idA}/hilang.png`, 'hash-hilang');
  });

  afterAll(async () => {
    fs.rmSync(folderUpload(), { recursive: true, force: true });
    await pool.end();
  });

  test('simulasi hanya menghitung, tidak menghapus apa pun', async () => {
    const r = await bersihkanFoto({ hari: 90, simulasi: true });
    expect(r.kandidat).toBe(2);
    expect(r.dihapus).toBe(0);
    expect(fs.existsSync(fileLama)).toBe(true);
  });

  test('foto lebih dari 90 hari dihapus (file dan kolom), termasuk yang filenya sudah hilang', async () => {
    const r = await bersihkanFoto({ hari: 90 });
    expect(r.dihapus).toBe(2);
    expect(r.gagal).toBe(0);
    expect(fs.existsSync(fileLama)).toBe(false);

    for (const id of [g.lama, g.hilang]) {
      const row = await ambil(id);
      expect(row.foto_path).toBeNull();
      expect(row.foto_hash).toBeNull();
    }
  });

  test('foto yang masih baru tidak tersentuh', async () => {
    expect(fs.existsSync(fileBaru)).toBe(true);
    const row = await ambil(g.baru);
    expect(row.foto_path).toBe(`${idA}/baru.png`);
    expect(row.foto_hash).toBe('hash-baru');
  });

  test('dijalankan lagi: tidak ada yang tersisa', async () => {
    const r = await bersihkanFoto({ hari: 90 });
    expect(r.kandidat).toBe(0);
  });
});
