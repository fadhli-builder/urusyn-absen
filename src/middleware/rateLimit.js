const rateLimit = require('express-rate-limit');

function buatLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    skipSuccessfulRequests: true, // hanya percobaan gagal yang dihitung
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan gagal, coba lagi 15 menit lagi' },
  });
}

module.exports = {
  limiterLogin: buatLimiter(),
  limiterGantiPassword: buatLimiter(),
  limiterLoginGuru: buatLimiter(),

  // absen: dihitung per GURU (bukan per IP), hanya permintaan POST. Mencegah spam upload.
  limiterAbsen: rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => 'guru:' + req.guruId,
    skip: (req) => req.method !== 'POST',
    message: { error: 'Terlalu banyak percobaan absen. Coba lagi beberapa menit lagi.' },
  }),
};
