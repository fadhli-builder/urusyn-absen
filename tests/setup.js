require('dotenv').config({ quiet: true });

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// penjaga: tes menghapus isi tabel, jadi WAJIB database test
if (!/_test$/.test(process.env.DATABASE_URL || '')) {
  throw new Error('DATABASE_URL untuk tes harus berakhiran _test. Tes dihentikan.');
}
process.env.UPLOAD_DIR = require('path').join(require('os').tmpdir(), 'urusyn-uploads-test');
