require('dotenv').config({ quiet: true });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!/_test$/.test(process.env.DATABASE_URL || '')) {
  console.error('DATABASE_URL harus berakhiran _test.');
  process.exit(1);
}

require('../src/db/migrate');