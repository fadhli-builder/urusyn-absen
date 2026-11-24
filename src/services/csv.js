// Sel yang diawali = + - @ tab atau CR bisa dibaca Excel sebagai rumus (CSV injection).
// Diberi awalan ' supaya jadi teks biasa.
function aman(nilai) {
  let s = nilai === null || nilai === undefined ? '' : String(nilai);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// BOM di depan supaya Excel membaca UTF-8 dengan benar
function buatCsv(baris) {
  return '\uFEFF' + baris.map((b) => b.map(aman).join(',')).join('\r\n') + '\r\n';
}

module.exports = { aman, buatCsv };
