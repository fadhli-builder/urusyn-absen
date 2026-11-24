const { query } = require('./query');

async function ambilAbsenHariIni(sekolahId, guruId, tanggal) {
  const hasil = await query(
    'SELECT id, jam_masuk, jam_pulang FROM absensi WHERE sekolah_id = $1 AND guru_id = $2 AND tanggal = $3',
    [sekolahId, guruId, tanggal]
  );
  return hasil.rows[0] || null;
}

// "jam_pulang IS NULL" di WHERE membuat pulang hanya bisa sekali, bahkan kalau dua permintaan datang bersamaan
async function catatAbsenPulang(sekolahId, guruId, tanggal, waktu) {
  const hasil = await query(
    `UPDATE absensi SET jam_pulang = $4
     WHERE sekolah_id = $1 AND guru_id = $2 AND tanggal = $3 AND jam_pulang IS NULL
     RETURNING id, tanggal, jam_masuk, jam_pulang`,
    [sekolahId, guruId, tanggal, waktu]
  );
  return hasil.rows[0] || null;
}

module.exports = { ambilAbsenHariIni, catatAbsenPulang };
