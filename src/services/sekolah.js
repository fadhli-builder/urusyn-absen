// Satu-satunya tempat yang tahu slug sekolah datang dari mana.
// Kalau nanti pindah ke subdomain, cukup ubah fungsi ini.
function ambilSlugSekolah(req) {
  const slug = (req.params && req.params.slug) || (req.body && req.body.sekolah) || '';
  return String(slug).trim();
}

module.exports = { ambilSlugSekolah };