const ZONA = 'Asia/Jakarta';

// tanggal kalender di WIB, format YYYY-MM-DD (bukan tanggal UTC server)
function tanggalWIB(waktu = new Date()) {
  return waktu.toLocaleDateString('en-CA', { timeZone: ZONA });
}

// menit sejak tengah malam WIB (detik dibuang)
function menitWIB(waktu = new Date()) {
  const bagian = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(waktu);
  const jam = Number(bagian.find((p) => p.type === 'hour').value);
  const menit = Number(bagian.find((p) => p.type === 'minute').value);
  return jam * 60 + menit;
}

function jamKeMenit(jam) {
  const [h, m] = String(jam).split(':').map(Number);
  return h * 60 + m;
}

// jamMasuk 'HH:MM' atau 'HH:MM:SS'. Telat kalau menit WIB sudah melewati jam masuk + toleransi.
function hitungStatus(jamMasuk, toleransiMenit, waktu = new Date()) {
  const batas = jamKeMenit(jamMasuk) + (toleransiMenit || 0);
  return menitWIB(waktu) > batas ? 'telat' : 'hadir';
}

module.exports = { tanggalWIB, menitWIB, hitungStatus };
