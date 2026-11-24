const { query } = require('./query');

async function ambilPersetujuan(sekolahId, guruId) {
  const hasil = await query(
    'SELECT persetujuan_pada, persetujuan_versi FROM guru WHERE sekolah_id = $1 AND id = $2 AND aktif = true',
    [sekolahId, guruId]
  );
  return hasil.rows[0] || null;
}

async function simpanPersetujuan(sekolahId, guruId, versi) {
  const hasil = await query(
    `UPDATE guru SET persetujuan_pada = now(), persetujuan_versi = $1
     WHERE sekolah_id = $2 AND id = $3 AND aktif = true
     RETURNING persetujuan_pada`,
    [versi, sekolahId, guruId]
  );
  return hasil.rows[0] || null;
}

module.exports = { ambilPersetujuan, simpanPersetujuan };
