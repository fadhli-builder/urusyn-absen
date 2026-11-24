const { query } = require('./query');

// ON CONFLICT: kalau guru sudah absen di tanggal itu, tidak ada baris baru dan hasilnya null
async function catatAbsenMasuk(sekolahId, guruId, d) {
  const hasil = await query(
    `INSERT INTO absensi (sekolah_id, guru_id, tanggal, jam_masuk, status, lat, lng, akurasi_m)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (guru_id, tanggal) DO NOTHING
     RETURNING id, tanggal, jam_masuk, status`,
    [sekolahId, guruId, d.tanggal, d.waktu, d.status, d.lat, d.lng, d.akurasi]
  );
  return hasil.rows[0] || null;
}

module.exports = { catatAbsenMasuk };
