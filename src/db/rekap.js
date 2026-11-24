const { query } = require('./query');

async function rekapHariIni(sekolahId, tanggal) {
  const hasil = await query(
    `SELECT g.id AS guru_id, g.nama, a.id AS absensi_id, a.status, a.jam_masuk, a.jam_pulang,
            (a.foto_path IS NOT NULL) AS ada_foto
     FROM guru g
     LEFT JOIN absensi a
       ON a.guru_id = g.id AND a.sekolah_id = g.sekolah_id AND a.tanggal = $2
     WHERE g.sekolah_id = $1 AND g.aktif = true
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

module.exports = { rekapHariIni, guruUntukBulan, absensiBulan };
