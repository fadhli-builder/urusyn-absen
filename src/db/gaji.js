const { query } = require('./query');

// guru aktif, plus guru nonaktif yang punya absen di bulan itu (riwayat tidak boleh hilang)
async function gajiBulan(sekolahId, awalBulan) {
  const hasil = await query(
    `SELECT g.id, g.nama, g.aktif, g.pertemuan_per_hari, g.tarif_per_pertemuan,
            COUNT(a.id)::int AS hari_hadir
     FROM guru g
     LEFT JOIN absensi a
       ON a.guru_id = g.id AND a.sekolah_id = g.sekolah_id
      AND a.tanggal >= $2::date AND a.tanggal < ($2::date + interval '1 month')
     WHERE g.sekolah_id = $1
     GROUP BY g.id
     HAVING g.aktif = true OR COUNT(a.id) > 0
     ORDER BY g.nama`,
    [sekolahId, awalBulan]
  );
  return hasil.rows;
}

async function ubahTarifGuru(sekolahId, guruId, pertemuanPerHari, tarif) {
  const hasil = await query(
    `UPDATE guru SET pertemuan_per_hari = $1, tarif_per_pertemuan = $2
     WHERE sekolah_id = $3 AND id = $4
     RETURNING id, nama, pertemuan_per_hari, tarif_per_pertemuan`,
    [pertemuanPerHari, tarif, sekolahId, guruId]
  );
  return hasil.rows[0] || null;
}

module.exports = { gajiBulan, ubahTarifGuru };
