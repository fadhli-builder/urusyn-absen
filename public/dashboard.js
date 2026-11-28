const POLA_TANGGAL = /^20\d{2}-\d{2}-\d{2}$/;
let tanggalHariIni = null; // diisi dari server saat pemuatan pertama
let tanggalTerpilih = null; // null = hari ini

function el(tag, teks, kelas) {
  const e = document.createElement(tag);
  if (teks !== undefined) e.textContent = teks; // textContent, aman dari XSS
  if (kelas) e.className = kelas;
  return e;
}

const jamWIB = (iso) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
    : '-';

const formatPanjang = (t) =>
  new Date(t + 'T00:00:00+07:00').toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

// aritmetika tanggal murni pada teks YYYY-MM-DD (UTC), tidak terpengaruh zona waktu perangkat
function geserTanggal(tanggal, hari) {
  const d = new Date(tanggal + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

function kartu(label, angka) {
  const k = el('div', undefined, 'stat');
  k.append(el('b', angka), el('span', label));
  return k;
}

function barisKosong(teks, kolom) {
  const tr = el('tr');
  const td = el('td', teks, 'mu');
  td.colSpan = kolom;
  tr.append(td);
  return tr;
}

function bukaFoto(absensiId, jenis, nama) {
  $('judulFoto').textContent = 'Selfie ' + jenis + ' - ' + nama;
  $('imgFoto').src = '/api/foto/' + encodeURIComponent(absensiId) + '?jenis=' + jenis;
  $('modalFoto').showModal();
}

// foto langsung tampil sebagai gambar kecil; klik untuk memperbesar
function thumb(absensiId, jenis, nama) {
  const tombol = el('button', undefined, 'thumb-btn');
  tombol.type = 'button';
  tombol.title = 'Perbesar foto ' + jenis;

  const img = document.createElement('img');
  img.className = 'thumb';
  img.alt = 'Selfie ' + jenis + ' ' + nama;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.width = 64;
  img.height = 64;
  img.src = '/api/foto/' + encodeURIComponent(absensiId) + '?jenis=' + jenis;
  img.addEventListener('error', () => tombol.replaceWith(el('div', 'Foto tidak ada', 'thumb-kosong')));

  tombol.append(img);
  tombol.addEventListener('click', () => bukaFoto(absensiId, jenis, nama));
  return tombol;
}

// satu sel "absen masuk" atau "absen pulang": foto, jam, jarak dari sekolah, dan tautan peta
function selAbsen(x, jenis, hariIni) {
  const td = el('td');
  const jam = jenis === 'masuk' ? x.jamMasuk : x.jamPulang;
  if (!jam) {
    td.append(el('span', hariIni ? 'Belum pulang' : 'Tidak absen pulang', 'mu'));
    return td;
  }

  const foto = jenis === 'masuk' ? x.fotoMasuk : x.fotoPulang;
  const lok = jenis === 'masuk' ? x.lokasiMasuk : x.lokasiPulang;

  const kotak = el('div', undefined, 'sel-absen');
  if (foto) kotak.append(thumb(x.absensiId, jenis, x.nama));

  const teks = el('div');
  teks.append(el('b', jamWIB(jam)));
  if (lok) {
    const info = el('span', undefined, 'kecil-info');
    info.title = lok.akurasiM != null ? 'Akurasi GPS sekitar ' + lok.akurasiM + ' m' : '';
    info.append(
      document.createTextNode(lok.jarakM != null ? lok.jarakM + ' m dari sekolah · ' : 'Lokasi tercatat · ')
    );
    const peta = el('a', 'Peta');
    peta.href = 'https://www.google.com/maps?q=' + encodeURIComponent(lok.lat) + ',' + encodeURIComponent(lok.lng);
    peta.target = '_blank';
    peta.rel = 'noopener noreferrer';
    info.append(peta);
    teks.append(info);
  } else if (jenis === 'pulang') {
    teks.append(el('span', 'Lokasi tidak tercatat', 'kecil-info')); // data lama, sebelum pulang memakai GPS
  }
  kotak.append(teks);
  td.append(kotak);
  return td;
}

async function muatDashboard(tanggal) {
  $('pesanDash').textContent = '';
  const url = tanggal
    ? '/api/rekap/harian?tanggal=' + encodeURIComponent(tanggal)
    : '/api/rekap/hari-ini';
  const res = await api(url);
  if (!res.ok) {
    if (res.status === 400) {
      const e = await res.json().catch(() => ({}));
      $('pesanDash').textContent = e.error || 'Tanggal tidak valid.';
    }
    return; // misalnya belum ganti password
  }
  const d = await res.json();

  if (d.hariIni) {
    tanggalHariIni = d.tanggal;
    tanggalTerpilih = null;
  } else {
    tanggalTerpilih = d.tanggal;
  }

  $('inputTanggal').value = d.tanggal;
  if (tanggalHariIni) $('inputTanggal').max = tanggalHariIni;
  $('hariBerikutnya').disabled = d.hariIni;
  $('hariIniBtn').disabled = d.hariIni;
  $('labelHari').textContent = d.hariIni ? 'Hari ini' : 'Riwayat absensi';
  $('tanggalDash').textContent = formatPanjang(d.tanggal);

  const r = d.ringkasan;
  const labelBelum = d.hariIni ? 'Belum absen' : 'Tidak absen';
  $('kartuRingkasan').replaceChildren(
    kartu('Guru', r.total),
    kartu('Sudah absen', r.sudahAbsen),
    kartu('Telat', r.telat),
    kartu(labelBelum, r.belum)
  );

  const sudah = [
    ...d.hadir.map((x) => ({ ...x, status: 'hadir' })),
    ...d.telat.map((x) => ({ ...x, status: 'telat' })),
  ].sort((a, b) => a.nama.localeCompare(b.nama));

  const baris = sudah.map((x) => {
    const tr = el('tr');
    const status = el('td');
    status.append(el('span', x.status === 'telat' ? 'Telat' : 'Hadir', 'lencana ' + x.status));
    tr.append(el('td', x.aktif === false ? x.nama + ' (nonaktif)' : x.nama), status);
    tr.append(selAbsen(x, 'masuk', d.hariIni), selAbsen(x, 'pulang', d.hariIni));
    return tr;
  });
  $('tabelHadir').replaceChildren(
    ...(baris.length
      ? baris
      : [barisKosong(d.hariIni ? 'Belum ada yang absen hari ini.' : 'Tidak ada yang absen pada tanggal ini.', 4)])
  );

  $('judulBelum').textContent = labelBelum;
  $('daftarBelum').replaceChildren(
    ...(d.belum.length
      ? d.belum.map((b) => el('span', b.nama, 'chip'))
      : [document.createTextNode(d.hariIni ? 'Semua guru aktif sudah absen.' : 'Semua guru tercatat absen.')])
  );

  $('catatanDash').textContent = d.hariIni
    ? 'Foto absen dihapus otomatis setelah 90 hari.'
    : 'Daftar "Tidak absen" memuat semua guru aktif yang tidak punya catatan absen pada tanggal ini, ' +
      'termasuk akhir pekan, hari libur, dan guru yang baru ditambahkan. Foto absen dihapus otomatis setelah 90 hari.';
}

$('tutupFoto').addEventListener('click', () => {
  $('imgFoto').removeAttribute('src');
  $('modalFoto').close();
});

$('inputTanggal').addEventListener('change', () => {
  const t = $('inputTanggal').value;
  if (POLA_TANGGAL.test(t)) muatDashboard(t); // kosong (tanggal dihapus) diabaikan
});
$('hariSebelumnya').addEventListener('click', () => {
  const t = $('inputTanggal').value;
  if (POLA_TANGGAL.test(t)) muatDashboard(geserTanggal(t, -1));
});
$('hariBerikutnya').addEventListener('click', () => {
  const t = $('inputTanggal').value;
  if (POLA_TANGGAL.test(t)) muatDashboard(geserTanggal(t, 1));
});
$('hariIniBtn').addEventListener('click', () => muatDashboard());

window.addEventListener('hashchange', () => {
  if (location.hash === '' || location.hash === '#dashboard') muatDashboard(tanggalTerpilih || undefined);
});
if (location.hash === '' || location.hash === '#dashboard') muatDashboard();
