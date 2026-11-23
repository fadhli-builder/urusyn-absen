const bcrypt = require('bcrypt');
const request = require('supertest');
const { query } = require('../src/db/query');

async function resetDb() {
  await query('TRUNCATE absensi, guru, akun_admin, sekolah RESTART IDENTITY CASCADE');
}

async function buatSekolah(slug, nama, password) {
  const s = await query(
    'INSERT INTO sekolah (slug, nama) VALUES ($1, $2) RETURNING id',
    [slug, nama]
  );
  const hash = await bcrypt.hash(password, 4); // cost rendah supaya tes cepat
  await query(
    'INSERT INTO akun_admin (sekolah_id, password_hash, harus_ganti_password) VALUES ($1, $2, false)',
    [s.rows[0].id, hash]
  );
  return s.rows[0].id;
}

async function tambahGuru(sekolahId, nama) {
  const hash = await bcrypt.hash('123456', 4);
  const g = await query(
    'INSERT INTO guru (sekolah_id, nama, pin_hash) VALUES ($1, $2, $3) RETURNING id',
    [sekolahId, nama, hash]
  );
  return g.rows[0].id;
}

async function loginAgent(app, slug, password) {
  const agent = request.agent(app); // agent menyimpan cookie otomatis
  const res = await agent.post('/api/login').send({ sekolah: slug, password });
  if (res.status !== 200) {
    throw new Error('Login di helper gagal, status ' + res.status);
  }
  return agent;
}

module.exports = { resetDb, buatSekolah, tambahGuru, loginAgent };