const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const { pool } = require('../src/db/query');

const skema = z.object({
  slug: z
    .string()
    .min(3, 'slug minimal 3 karakter')
    .max(40, 'slug maksimal 40 karakter')
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'slug hanya huruf kecil, angka, dan tanda hubung (contoh: sma-negeri-1)'
    ),
  nama: z
    .string()
    .trim()
    .min(3, 'nama minimal 3 karakter')
    .max(100, 'nama maksimal 100 karakter'),
});

async function main() {
  const [slug, nama] = process.argv.slice(2);
  const cek = skema.safeParse({ slug, nama });

  if (!cek.success) {
    console.error('Input tidak valid:');
    for (const i of cek.error.issues) console.error(' -', i.message);
    console.error('Contoh: node scripts/buat-sekolah.js sma-demo "SMA Demo Nusantara"');
    process.exitCode = 1;
    return;
  }

  const password = crypto.randomBytes(12).toString('base64url'); // 16 karakter
  const hash = await bcrypt.hash(password, 12);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const s = await client.query(
      'INSERT INTO sekolah (slug, nama) VALUES ($1, $2) RETURNING id',
      [cek.data.slug, cek.data.nama]
    );
    await client.query(
      'INSERT INTO akun_admin (sekolah_id, password_hash) VALUES ($1, $2)',
      [s.rows[0].id, hash]
    );
    await client.query('COMMIT');

    console.log('Sekolah berhasil dibuat.');
    console.log('ID Sekolah         :', cek.data.slug);
    console.log('Username           : admin');
    console.log('Password sementara :', password);
    console.log('CATAT SEKARANG. Password ini tidak akan ditampilkan lagi.');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      console.error(`Gagal: slug "${cek.data.slug}" sudah dipakai.`);
    } else {
      console.error('Gagal:', err.message);
    }
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

main().finally(() => pool.end());