require('dotenv').config();
const { Pool, types } = require('pg');

// kolom DATE dikembalikan sebagai teks 'YYYY-MM-DD', bukan objek Date (hindari geser zona waktu)
types.setTypeParser(1082, (v) => v);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = pool;