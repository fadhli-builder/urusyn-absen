const { query } = require('./query');

async function absensiBulanDetail(sekolahId, awalBulan) {
  const hasil = await query(
    `SELECT g.nama, a.tanggal, a.status, a.jam_masuk, a.jam_pulang
     FROM absensi a
     JOIN guru g ON g.id = a.guru_id AND g.sekolah_id = a.sekolah_id
     WHERE a.sekolah_id = $1
       AND a.tanggal >= $2::date AND a.tanggal < ($2::date + interval '1 month')
     ORDER BY g.nama, a.tanggal`,
    [sekolahId, awalBulan]
  );
  return hasil.rows;
}

module.exports = { absensiBulanDetail };
