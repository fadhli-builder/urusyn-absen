const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { query, pool } = require('../src/db/query');

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Pakai: node scripts/reset-password.js <slug>');
    process.exitCode = 1;
    return;
  }

  const password = crypto.randomBytes(12).toString('base64url');
  const hash = await bcrypt.hash(password, 12);

  const hasil = await query(
    `UPDATE akun_admin
     SET password_hash = $1, harus_ganti_password = true
     WHERE username = 'admin'
       AND sekolah_id = (SELECT id FROM sekolah WHERE slug = $2)`,
    [hash, slug]
  );

  if (hasil.rowCount === 0) {
    console.error(`Gagal: sekolah dengan slug "${slug}" tidak ditemukan.`);
    process.exitCode = 1;
    return;
  }

  console.log('Password direset.');
  console.log('ID Sekolah         :', slug);
  console.log('Password sementara :', password);
  console.log('CATAT SEKARANG. Password ini tidak akan ditampilkan lagi.');
}

main().finally(() => pool.end());