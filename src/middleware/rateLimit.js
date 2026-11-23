const rateLimit = require('express-rate-limit');

const limiterLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true, // hanya percobaan gagal yang dihitung
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan gagal, coba lagi 15 menit lagi' },
});

module.exports = { limiterLogin };