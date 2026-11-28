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

describe('bersihkan foto masuk dan foto pulang', () => {
  let idA;
  let g = {};
  let f = {};

  const sisip = (guruId, hari, masuk, pulang) =>
    query(
      `INSERT INTO absensi (sekolah_id, guru_id, tanggal, jam_masuk, status, lat, lng,
         foto_path, foto_hash, foto_pulang_path, foto_pulang_hash)
       VALUES ($1, $2, current_date, now() - ($3::int * interval '1 day'), 'hadir', -6.2, 106.8,
         $4, $5, $6, $7)`,
      [idA, guruId, hari, masuk, masuk ? 'hm-' + guruId : null, pulang, pulang ? 'hp-' + guruId : null]
    );

  const ambil = async (guruId) =>
    (
      await query(
        'SELECT foto_path, foto_hash, foto_pulang_path, foto_pulang_hash FROM absensi WHERE guru_id = $1',
        [guruId]
      )
    ).rows[0];

  beforeAll(async () => {
    await resetDb();
    idA = await buatSekolah('sekolah-a', 'Sekolah A', 'passA-12345');
    g.lama = await tambahGuru(idA, 'Guru Lama');
    g.hilang = await tambahGuru(idA, 'Guru Hilang');
    g.baru = await tambahGuru(idA, 'Guru Baru');

    f.lamaMasuk = tulis(`${idA}/lama-masuk.png`);
    f.lamaPulang = tulis(`${idA}/lama-pulang.png`);
    f.baruMasuk = tulis(`${idA}/baru-masuk.png`);
    f.baruPulang = tulis(`${idA}/baru-pulang.png`);
    // 'hilang': hanya foto pulang, dan filenya sudah tidak ada di disk

    await sisip(g.lama, 100, `${idA}/lama-masuk.png`, `${idA}/lama-pulang.png`);
    await sisip(g.hilang, 120, null, `${idA}/hilang-pulang.png`);
    await sisip(g.baru, 2, `${idA}/baru-masuk.png`, `${idA}/baru-pulang.png`);
  });

  afterAll(async () => {
    fs.rmSync(folderUpload(), { recursive: true, force: true });
    await pool.end();
  });

  test('simulasi menghitung jumlah foto (masuk dan pulang), tanpa menghapus', async () => {
    const r = await bersihkanFoto({ hari: 90, simulasi: true });
    expect(r.kandidat).toBe(3); // lama: 2 foto, hilang: 1 foto
    expect(r.dihapus).toBe(0);
    expect(fs.existsSync(f.lamaMasuk)).toBe(true);
    expect(fs.existsSync(f.lamaPulang)).toBe(true);
  });

  test('kedua jenis foto lama dihapus (file dan kolom), termasuk yang filenya sudah hilang', async () => {
    const r = await bersihkanFoto({ hari: 90 });
    expect(r.dihapus).toBe(3);
    expect(r.gagal).toBe(0);
    expect(fs.existsSync(f.lamaMasuk)).toBe(false);
    expect(fs.existsSync(f.lamaPulang)).toBe(false);

    for (const id of [g.lama, g.hilang]) {
      const row = await ambil(id);
      expect(row.foto_path).toBeNull();
      expect(row.foto_hash).toBeNull();
      expect(row.foto_pulang_path).toBeNull();
      expect(row.foto_pulang_hash).toBeNull();
    }
  });

  test('foto yang masih baru, masuk maupun pulang, tidak tersentuh', async () => {
    expect(fs.existsSync(f.baruMasuk)).toBe(true);
    expect(fs.existsSync(f.baruPulang)).toBe(true);
    const row = await ambil(g.baru);
    expect(row.foto_path).toBe(`${idA}/baru-masuk.png`);
    expect(row.foto_pulang_path).toBe(`${idA}/baru-pulang.png`);
    expect(row.foto_pulang_hash).toBe('hp-' + g.baru);
  });

  test('dijalankan lagi: tidak ada yang tersisa', async () => {
    const r = await bersihkanFoto({ hari: 90 });
    expect(r.kandidat).toBe(0);
  });
});
