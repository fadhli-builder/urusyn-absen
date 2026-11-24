const { query } = require('./query');

async function sudahAbsenHariIni(sekolahId, guruId, tanggal) {
  const hasil = await query(
    'SELECT 1 FROM absensi WHERE sekolah_id = $1 AND guru_id = $2 AND tanggal = $3',
    [sekolahId, guruId, tanggal]
  );
  return hasil.rowCount > 0;
}

async function fotoSudahAda(sekolahId, fotoHash) {
  const hasil = await query(
    'SELECT 1 FROM absensi WHERE sekolah_id = $1 AND foto_hash = $2 LIMIT 1',
    [sekolahId, fotoHash]
  );
  return hasil.rowCount > 0;
}

// ON CONFLICT: kalau guru sudah absen di tanggal itu, tidak ada baris baru dan hasilnya null
async function catatAbsenMasuk(sekolahId, guruId, d) {
  const hasil = await query(
    `INSERT INTO absensi (sekolah_id, guru_id, tanggal, jam_masuk, status, lat, lng, akurasi_m, foto_path, foto_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (guru_id, tanggal) DO NOTHING
     RETURNING id, tanggal, jam_masuk, status`,
    [
      sekolahId,
      guruId,
      d.tanggal,
      d.waktu,
      d.status,
      d.lat,
      d.lng,
      d.akurasi,
      d.fotoPath ?? null,
      d.fotoHash ?? null,
    ]
  );
  return hasil.rows[0] || null;
}

module.exports = { sudahAbsenHariIni, fotoSudahAda, catatAbsenMasuk };
