const { ambilPersetujuan } = require('../db/persetujuan');
const { VERSI_PERSETUJUAN } = require('../services/persetujuan');

async function wajibPersetujuan(req, res, next) {
  const p = await ambilPersetujuan(req.sekolahId, req.guruId);
  if (!p) return res.status(401).json({ error: 'Belum login' });
  if (!p.persetujuan_pada || p.persetujuan_versi !== VERSI_PERSETUJUAN) {
    return res.status(403).json({ error: 'Setujui penggunaan data dulu', perluPersetujuan: true });
  }
  next();
}

module.exports = { wajibPersetujuan };
