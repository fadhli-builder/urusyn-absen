const { query } = require('./query');

// Guru aktif ditambah guru nonaktif yang punya absen pada tanggal itu (riwayat tidak boleh hilang).
async function rekapHarian(sekolahId, tanggal) {
  const hasil = await query(
    `SELECT g.id AS guru_id, g.nama, g.aktif,
            a.id AS absensi_id, a.status, a.jam_masuk, a.jam_pulang,
            a.lat, a.lng, a.akurasi_m,
            a.lat_pulang, a.lng_pulang, a.akurasi_pulang_m,
            (a.foto_path IS NOT NULL) AS foto_masuk,
            (a.foto_pulang_path IS NOT NULL) AS foto_pulang
     FROM guru g
     LEFT JOIN absensi a
       ON a.guru_id = g.id AND a.sekolah_id = g.sekolah_id AND a.tanggal = $2
     WHERE g.sekolah_id = $1 AND (g.aktif = true OR a.id IS NOT NULL)
     ORDER BY g.nama`,
    [sekolahId, tanggal]
  );
  return hasil.rows;
}

// guru aktif, plus guru nonaktif yang punya absen di bulan itu (riwayat tidak boleh hilang)
async function guruUntukBulan(sekolahId, awalBulan) {
  const hasil = await query(
    `SELECT g.id, g.nama, g.aktif
     FROM guru g
     WHERE g.sekolah_id = $1
       AND (g.aktif = true OR EXISTS (
         SELECT 1 FROM absensi a
         WHERE a.sekolah_id = g.sekolah_id AND a.guru_id = g.id
           AND a.tanggal >= $2::date AND a.tanggal < ($2::date + interval '1 month')
       ))
     ORDER BY g.nama`,
    [sekolahId, awalBulan]
  );
  return hasil.rows;
}

async function absensiBulan(sekolahId, awalBulan) {
  const hasil = await query(
    `SELECT id, guru_id, tanggal, status, jam_masuk, jam_pulang, (foto_path IS NOT NULL) AS ada_foto
     FROM absensi
     WHERE sekolah_id = $1
       AND tanggal >= $2::date AND tanggal < ($2::date + interval '1 month')
     ORDER BY tanggal`,
    [sekolahId, awalBulan]
  );
  return hasil.rows;
}

module.exports = { rekapHarian, guruUntukBulan, absensiBulan };
