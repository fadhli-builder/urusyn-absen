const { z } = require('zod');
const { query, pool } = require('../src/db/query');

const args = process.argv.slice(2);
const ambilOpsi = (nama) => {
  const i = args.indexOf(`--${nama}`);
  return i === -1 ? undefined : args[i + 1];
};

const skema = z.object({
  slug: z.string().min(1, 'slug wajib diisi'),
  sampai: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'format --sampai harus YYYY-MM-DD, contoh 2026-12-31')
    .optional(),
  aktif: z.enum(['true', 'false'], 'nilai --aktif harus true atau false').optional(),
});

async function main() {
  const cek = skema.safeParse({
    slug: args[0],
    sampai: ambilOpsi('sampai'),
    aktif: ambilOpsi('aktif'),
  });

  if (!cek.success || (cek.data.sampai === undefined && cek.data.aktif === undefined)) {
    console.error('Input tidak valid.');
    if (!cek.success) for (const i of cek.error.issues) console.error(' -', i.message);
    console.error('Pakai: node scripts/atur-langganan.js <slug> --sampai 2026-12-31 [--aktif false]');
    process.exitCode = 1;
    return;
  }

  const sampai = cek.data.sampai ?? null;
  const aktif = cek.data.aktif === undefined ? null : cek.data.aktif === 'true';

  try {
    const hasil = await query(
      `UPDATE sekolah
       SET berlaku_sampai = COALESCE($1, berlaku_sampai),
           aktif = COALESCE($2, aktif)
       WHERE slug = $3
       RETURNING slug, aktif, berlaku_sampai`,
      [sampai, aktif, cek.data.slug]
    );

    if (hasil.rowCount === 0) {
      console.error(`Gagal: sekolah dengan slug "${cek.data.slug}" tidak ditemukan.`);
      process.exitCode = 1;
      return;
    }
    console.log('Langganan diperbarui:', hasil.rows[0]);
  } catch (err) {
    console.error('Gagal:', err.message);
    process.exitCode = 1;
  }
}

main().finally(() => pool.end());