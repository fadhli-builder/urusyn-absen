const pool = require('./pool');

async function query(sql, params = []) {
  if (!Array.isArray(params)) {
    throw new Error('params harus berupa array, contoh: [sekolahId, nama]');
  }
  return pool.query(sql, params);
}

module.exports = { query, pool };