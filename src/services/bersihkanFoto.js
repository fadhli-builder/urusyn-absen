const fs = require('fs');
const path = require('path');
const { query } = require('../db/query');
const { folderUpload } = require('./uploads');

// Hapus FILE foto (masuk dan pulang) yang lebih tua dari `hari`, lalu kosongkan kolomnya.
// Urutan: file dulu, kolom kemudian. Kalau terputus di tengah, putaran berikutnya melanjutkan.
// "kandidat" dan "dihapus" menghitung jumlah FOTO, bukan jumlah baris absensi.
async function bersihkanFoto({ hari = 90, simulasi = false } = {}) {
  const dasar = path.resolve(folderUpload());
  const hasil = await query(
    `SELECT id, foto_path, foto_pulang_path FROM absensi
     WHERE (foto_path IS NOT NULL OR foto_pulang_path IS NOT NULL)
       AND jam_masuk < now() - ($1::int * interval '1 day')
     ORDER BY id`,
    [hari]
  );

  const daftar = [];
  for (const row of hasil.rows) {
    if (row.foto_path) daftar.push({ id: row.id, jenis: 'masuk', relatif: row.foto_path });
    if (row.foto_pulang_path) daftar.push({ id: row.id, jenis: 'pulang', relatif: row.foto_pulang_path });
  }

  const ringkas = { kandidat: daftar.length, dihapus: 0, gagal: 0 };
  if (simulasi) return ringkas;

  for (const f of daftar) {
    const penuh = path.resolve(dasar, f.relatif);
    if (!penuh.startsWith(dasar + path.sep)) {
      ringkas.gagal += 1; // path di luar folder upload: jangan disentuh
      continue;
    }
    try {
      await fs.promises.unlink(penuh);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        ringkas.gagal += 1; // gagal menghapus file: kolom dibiarkan supaya dicoba lagi
        continue;
      }
      // ENOENT = file sudah tidak ada, tetap kosongkan kolomnya
    }
    if (f.jenis === 'masuk') {
      await query('UPDATE absensi SET foto_path = NULL, foto_hash = NULL WHERE id = $1', [f.id]);
    } else {
      await query(
        'UPDATE absensi SET foto_pulang_path = NULL, foto_pulang_hash = NULL WHERE id = $1',
        [f.id]
      );
    }
    ringkas.dihapus += 1;
  }
  return ringkas;
}

module.exports = { bersihkanFoto };
