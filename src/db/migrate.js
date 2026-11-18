const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrasi (
      nama TEXT PRIMARY KEY,
      dijalankan_pada TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const folder = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(folder).filter((f) => f.endsWith('.sql')).sort();

  const sudah = await pool.query('SELECT nama FROM migrasi');
  const sudahSet = new Set(sudah.rows.map((r) => r.nama));

  for (const file of files) {
    if (sudahSet.has(file)) {
      console.log(`lewati  ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(folder, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO migrasi (nama) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`jalan   ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`GAGAL   ${file}: ${err.message}`);
      process.exitCode = 1;
      break;
    } finally {
      client.release();
    }
  }

  await pool.end();
}

migrate();