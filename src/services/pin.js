const { z } = require('zod');

// PIN guru dibuat manual oleh admin: tepat 6 angka. Angka kembar (111111) dan berurutan
// (123456, 654321) ditolak karena terlalu mudah ditebak guru lain.
function terlaluMudah(pin) {
  if (typeof pin !== 'string' || pin.length !== 6) return false;
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const d = pin.split('').map(Number);
  const selisih = d.slice(1).map((x, i) => x - d[i]);
  return selisih.every((s) => s === 1) || selisih.every((s) => s === -1);
}

const skemaPin = z
  .string()
  .regex(/^\d{6}$/, 'PIN harus tepat 6 angka')
  .refine((p) => !terlaluMudah(p), 'PIN terlalu mudah ditebak (angka kembar atau berurutan). Pilih PIN lain.');

module.exports = { skemaPin, terlaluMudah };
