const bcrypt = require('bcrypt');
const { query, pool } = require('../src/db/query');

const DATA = [
  { slug: 'sekolah-a', nama: 'Sekolah Palsu A', guru: ['Guru A1', 'Guru A2', 'Guru A3'] },
  { slug: 'sekolah-b', nama: 'Sekolah Palsu B', guru: ['Guru B1', 'Guru B2', 'Guru B3'] },
];

async function seed() {
  const pinHash = await bcrypt.hash('123456', 10);

  for (const s of DATA) {
    const hasil = await query(
      `INSERT INTO sekolah (slug, nama) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET nama = EXCLUDED.nama
       RETURNING id`,
      [s.slug, s.nama]
    );
    const sekolahId = hasil.rows[0].id;

    for (const nama of s.guru) {
      await query(
        `INSERT INTO guru (sekolah_id, nama, pin_hash) VALUES ($1, $2, $3)
         ON CONFLICT (sekolah_id, nama) DO NOTHING`,
        [sekolahId, nama, pinHash]
      );
    }
  }

  console.log('seed selesai');
  await pool.end();
}

seed();