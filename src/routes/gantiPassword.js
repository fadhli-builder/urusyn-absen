const express = require('express');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const { query } = require('../db/query');
const { limiterGantiPassword } = require('../middleware/rateLimit');

const router = express.Router();

const skema = z.object({
  passwordLama: z.string().min(1).max(200),
  passwordBaru: z
    .string()
    .min(8, 'Password baru minimal 8 karakter')
    .max(72, 'Password baru maksimal 72 karakter'),
});

router.post('/', limiterGantiPassword, async (req, res) => {
  const cek = skema.safeParse(req.body);
  if (!cek.success) {
    return res.status(400).json({ error: cek.error.issues[0].message });
  }
  const { passwordLama, passwordBaru } = cek.data;
  if (passwordLama === passwordBaru) {
    return res.status(400).json({ error: 'Password baru harus berbeda dari password lama' });
  }

  const hasil = await query(
    "SELECT password_hash FROM akun_admin WHERE sekolah_id = $1 AND username = 'admin'",
    [req.sekolahId]
  );
  const row = hasil.rows[0];
  if (!row || !(await bcrypt.compare(passwordLama, row.password_hash))) {
    return res.status(400).json({ error: 'Password lama salah' });
  }

  const hashBaru = await bcrypt.hash(passwordBaru, 12);
  await query(
    "UPDATE akun_admin SET password_hash = $1, harus_ganti_password = false WHERE sekolah_id = $2 AND username = 'admin'",
    [hashBaru, req.sekolahId]
  );
  res.json({ ok: true });
});

module.exports = router;