const { query } = require('./query');

async function ambilAbsenHariIni(sekolahId, guruId, tanggal) {
  const hasil = await query(
    'SELECT id, jam_masuk, jam_pulang FROM absensi WHERE sekolah_id = $1 AND guru_id = $2 AND tanggal = $3',
    [sekolahId, guruId, tanggal]
  );
  return hasil.rows[0] || null;
}

// "jam_pulang IS NULL" di WHERE membuat pulang hanya bisa sekali, bahkan kalau dua permintaan datang bersamaan
async function catatAbsenPulang(sekolahId, guruId, tanggal, d) {
  const hasil = await query(
    `UPDATE absensi
     SET jam_pulang = $4, lat_pulang = $5, lng_pulang = $6, akurasi_pulang_m = $7,
         foto_pulang_path = $8, foto_pulang_hash = $9
     WHERE sekolah_id = $1 AND guru_id = $2 AND tanggal = $3 AND jam_pulang IS NULL
     RETURNING id, tanggal, jam_masuk, jam_pulang`,
    [
      sekolahId,
      guruId,
      tanggal,
      d.waktu,
      d.lat,
      d.lng,
      d.akurasi,
      d.fotoPath ?? null,
      d.fotoHash ?? null,
    ]
  );
  return hasil.rows[0] || null;
}

module.exports = { ambilAbsenHariIni, catatAbsenPulang };
