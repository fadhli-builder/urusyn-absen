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

async function tambahGuru(sekolahId, nama, pinHash) {
  const hasil = await query(
    'INSERT INTO guru (sekolah_id, nama, pin_hash) VALUES ($1, $2, $3) RETURNING id, nama, aktif',
    [sekolahId, nama, pinHash]
  );
  return hasil.rows[0];
}

async function ubahAktifGuru(sekolahId, guruId, aktif) {
  const hasil = await query(
    'UPDATE guru SET aktif = $1 WHERE sekolah_id = $2 AND id = $3 RETURNING id, nama, aktif',
    [aktif, sekolahId, guruId]
  );
  return hasil.rows[0] || null;
}

async function ubahPinGuru(sekolahId, guruId, pinHash) {
  const hasil = await query(
    'UPDATE guru SET pin_hash = $1 WHERE sekolah_id = $2 AND id = $3 RETURNING id',
    [pinHash, sekolahId, guruId]
  );
  return hasil.rows[0] || null;
}

module.exports = { daftarGuru, ambilGuru, tambahGuru, ubahAktifGuru, ubahPinGuru };