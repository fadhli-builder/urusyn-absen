const fs = require('fs');
const path = require('path');
const { query } = require('../db/query');
const { folderUpload } = require('./uploads');

// Hapus FILE foto yang lebih tua dari `hari`, lalu kosongkan kolom foto_path dan foto_hash.
// Urutan: file dulu, kolom kemudian. Kalau terputus di tengah, putaran berikutnya melanjutkan.
async function bersihkanFoto({ hari = 90, simulasi = false } = {}) {
  const dasar = path.resolve(folderUpload());
  const hasil = await query(
    `SELECT id, foto_path FROM absensi
     WHERE foto_path IS NOT NULL AND jam_masuk < now() - ($1::int * interval '1 day')
     ORDER BY id`,
    [hari]
  );

  const ringkas = { kandidat: hasil.rowCount, dihapus: 0, gagal: 0 };
  if (simulasi) return ringkas;

  for (const row of hasil.rows) {
    const penuh = path.resolve(dasar, row.foto_path);
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
    await query('UPDATE absensi SET foto_path = NULL, foto_hash = NULL WHERE id = $1', [row.id]);
    ringkas.dihapus += 1;
  }
  return ringkas;
}

module.exports = { bersihkanFoto };
