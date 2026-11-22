const { query } = require('./query');

async function daftarGuru(sekolahId) {
  const hasil = await query(
    'SELECT id, nama, aktif FROM guru WHERE sekolah_id = $1 ORDER BY nama',
    [sekolahId]
  );
  return hasil.rows;
}

async function ambilGuru(sekolahId, guruId) {
  const hasil = await query(
    'SELECT id, nama, aktif FROM guru WHERE sekolah_id = $1 AND id = $2',
    [sekolahId, guruId]
  );
  return hasil.rows[0] || null;
}

module.exports = { daftarGuru, ambilGuru };