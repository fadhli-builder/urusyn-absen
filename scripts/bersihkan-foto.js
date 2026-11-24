const { pool } = require('../src/db/query');
const { bersihkanFoto } = require('../src/services/bersihkanFoto');

const args = process.argv.slice(2);
const i = args.indexOf('--hari');
const hari = i === -1 ? 90 : Number(args[i + 1]);
const simulasi = args.includes('--simulasi');

if (!Number.isInteger(hari) || hari < 1) {
  console.error('Pakai: node scripts/bersihkan-foto.js [--hari 90] [--simulasi]');
  process.exit(1);
}

bersihkanFoto({ hari, simulasi })
  .then((r) => console.log(simulasi ? 'SIMULASI (tidak ada yang dihapus):' : 'Selesai:', r))
  .catch((err) => {
    console.error('Gagal:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
