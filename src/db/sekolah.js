const { query } = require('./query');

async function ambilPengaturan(sekolahId) {
  const hasil = await query(
    `SELECT slug, nama, aktif, berlaku_sampai, selfie_aktif, lat, lng,
            radius_m, jam_masuk, toleransi_menit, akurasi_maks_m
     FROM sekolah WHERE id = $1`,
    [sekolahId]
  );
  return hasil.rows[0] || null;
}

async function ubahPengaturan(sekolahId, d) {
  await query(
    `UPDATE sekolah SET
       lat = COALESCE($1, lat),
       lng = COALESCE($2, lng),
       radius_m = COALESCE($3, radius_m),
       jam_masuk = COALESCE($4, jam_masuk),
       toleransi_menit = COALESCE($5, toleransi_menit),
       akurasi_maks_m = COALESCE($6, akurasi_maks_m),
       selfie_aktif = COALESCE($7, selfie_aktif)
     WHERE id = $8`,
    [
      d.lat ?? null,
      d.lng ?? null,
      d.radius_m ?? null,
      d.jam_masuk ?? null,
      d.toleransi_menit ?? null,
      d.akurasi_maks_m ?? null,
      d.selfie_aktif ?? null,
      sekolahId,
    ]
  );
  return ambilPengaturan(sekolahId);
}

module.exports = { ambilPengaturan, ubahPengaturan };