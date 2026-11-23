const jwt = require('jsonwebtoken');

function requireAdmin(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Belum login' });

  try {
    const data = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (data.peran !== 'admin' || !data.sekolahId) {
      return res.status(401).json({ error: 'Belum login' });
    }
    req.sekolahId = data.sekolahId; // satu-satunya sumber sekolahId untuk endpoint admin
    next();
  } catch (err) {
    res.status(401).json({ error: 'Belum login' });
  }
}

module.exports = { requireAdmin };