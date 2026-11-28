const slug = location.pathname.split('/')[2] || '';
const $ = (id) => document.getElementById(id);
let versiTeks = '';
let namaSekolah = '';
let sibuk = false;
let selfieWajib = false;
let fotoBlob = null;

const fmtJam = (iso) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

const fmtTanggal = (t) =>
  new Date(t + 'T00:00:00+07:00').toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

function tampil(teks) {
  $('pesan').textContent = teks; // textContent, aman dari XSS
}

function pesanAbsen(teks, sukses) {
  $('pesanAbsen').textContent = teks;
  $('pesanAbsen').className = sukses ? 'err ok' : 'err';
}

function resetFoto() {
  fotoBlob = null;
  $('pratinjau').hidden = true;
  $('infoFoto').textContent = '';
}

function tampilkanLogin(teks) {
  $('absen').hidden = true;
  $('setuju').hidden = true;
  $('form').hidden = false;
  $('tombol').disabled = false;
  $('judul').textContent = namaSekolah;
  $('info').textContent = '';
  if (teks) tampil(teks);
}

function ambilLokasi() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({ kode: 0 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, akurasi: p.coords.accuracy }),
      (e) => reject({ kode: e.code }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

function pesanLokasi(e) {
  if (e.kode === 1) return 'Izin lokasi ditolak. Izinkan akses lokasi untuk situs ini di pengaturan browser, lalu coba lagi.';
  if (e.kode === 2) return 'Lokasi tidak tersedia. Aktifkan GPS dan coba lagi di tempat terbuka.';
  if (e.kode === 3) return 'Mencari lokasi terlalu lama. Coba lagi di tempat terbuka.';
  return 'Browser ini tidak mendukung lokasi.';
}

// perkecil di HP: sisi terpanjang maksimal 800 px, JPEG kualitas 0,7
async function perkecil(file) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    bmp = await createImageBitmap(file); // browser lama
  }
  const skala = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * skala));
  const h = Math.max(1, Math.round(bmp.height * skala));
  const kanvas = $('pratinjau');
  kanvas.width = w;
  kanvas.height = h;
  kanvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const blob = await new Promise((ok) => kanvas.toBlob(ok, 'image/jpeg', 0.7));
  if (!blob) throw new Error('gagal');
  return blob;
}

// keadaan absen hari ini dari server, dipakai untuk mengatur tombol
let keadaan = { masuk: false, pulang: false };

function aturTombol() {
  const butuhFoto = selfieWajib && !fotoBlob;
  $('btnMasuk').disabled = keadaan.masuk || butuhFoto;
  $('btnPulang').disabled = !keadaan.masuk || keadaan.pulang || butuhFoto;
}

async function tampilAbsen() {
  $('setuju').hidden = true;
  const res = await fetch('/api/absen/hari-ini');
  if (res.status === 401) {
    tampilkanLogin('Sesi habis. Silakan masuk lagi.');
    return;
  }
  if (!res.ok) {
    $('info').textContent = 'Terjadi masalah. Muat ulang halaman ini.';
    return;
  }
  const d = await res.json();
  $('absen').hidden = false;
  $('tanggalAbsen').textContent = fmtTanggal(d.tanggal);
  $('statusMasuk').textContent = d.masuk
    ? fmtJam(d.masuk.jam) + ' WIB (' + (d.masuk.status === 'telat' ? 'Telat' : 'Hadir') + ')'
    : 'Belum absen';
  $('statusPulang').textContent = d.pulang ? fmtJam(d.pulang.jam) + ' WIB' : 'Belum absen';

  selfieWajib = d.selfieAktif;
  keadaan = { masuk: Boolean(d.masuk), pulang: Boolean(d.pulang) };

  // selfie dibutuhkan untuk absen masuk DAN absen pulang
  const perluFoto = d.selfieAktif && !d.pulang;
  $('blokSelfie').hidden = !perluFoto;
  $('infoSelfie').hidden = !perluFoto;
  $('infoSelfie').textContent =
    'Sekolah ini mewajibkan selfie. Ambil foto dulu sebelum absen ' + (d.masuk ? 'pulang' : 'masuk') + '.';
  if (!perluFoto) resetFoto();

  aturTombol();
}

async function kirimAbsen(jenis) {
  if (sibuk) return;
  if (selfieWajib && !fotoBlob) {
    pesanAbsen('Ambil selfie dulu sebelum absen ' + jenis + '.', false);
    return;
  }
  sibuk = true;
  pesanAbsen('', false);
  const tombol = jenis === 'masuk' ? $('btnMasuk') : $('btnPulang');
  const label = tombol.textContent;
  $('btnMasuk').disabled = true;
  $('btnPulang').disabled = true;

  try {
    // absen masuk dan pulang memakai aturan yang sama: lokasi GPS, plus selfie kalau diwajibkan
    tombol.textContent = 'Mencari lokasi...';
    const lok = await ambilLokasi();
    let body;
    let headers = {};
    if (selfieWajib) {
      const f = new FormData();
      f.append('lat', lok.lat);
      f.append('lng', lok.lng);
      f.append('akurasi', lok.akurasi);
      f.append('foto', fotoBlob, 'selfie.jpg');
      body = f; // Content-Type diatur browser (multipart)
    } else {
      body = JSON.stringify(lok);
      headers = { 'Content-Type': 'application/json' };
    }

    tombol.textContent = 'Mengirim...';
    const res = await fetch('/api/absen/' + jenis, { method: 'POST', headers, body });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      tampilkanLogin('Sesi habis. Silakan masuk lagi.');
      return;
    }
    if (res.ok) {
      resetFoto(); // untuk absen berikutnya wajib selfie baru
      pesanAbsen(
        jenis === 'masuk'
          ? 'Absen masuk berhasil. Status: ' + (data.status === 'telat' ? 'Telat' : 'Hadir') +
              '. Jarak dari titik sekolah sekitar ' + data.jarak_m + ' m.'
          : 'Absen pulang berhasil. Jarak dari titik sekolah sekitar ' + data.jarak_m + ' m. Hati-hati di jalan.',
        true
      );
    } else {
      if ([409, 413, 415].includes(res.status)) resetFoto(); // foto bermasalah: wajib ambil ulang
      pesanAbsen(data.error || 'Gagal. Coba lagi.', false);
    }
  } catch (e) {
    pesanAbsen(
      e && e.kode !== undefined ? pesanLokasi(e) : 'Tidak bisa terhubung. Periksa koneksi internet Anda.',
      false
    );
  } finally {
    tombol.textContent = label;
    sibuk = false;
    await tampilAbsen();
  }
}

async function cekPersetujuan() {
  const res = await fetch('/api/persetujuan');
  if (!res.ok) {
    $('info').textContent = 'Terjadi masalah. Muat ulang halaman ini.';
    return;
  }
  const data = await res.json();
  if (data.sudah) {
    await tampilAbsen();
    return;
  }
  versiTeks = data.versi;
  $('judulSetuju').textContent = data.teks.judul;
  $('poinSetuju').replaceChildren(
    ...data.teks.poin.map((p) => {
      const li = document.createElement('li');
      li.textContent = p;
      return li;
    })
  );
  $('setuju').hidden = false;
}

async function lanjut(nama) {
  $('form').hidden = true;
  $('judul').textContent = 'Halo, ' + nama;
  $('info').textContent = namaSekolah;
  await cekPersetujuan();
}

async function muat() {
  const res = await fetch('/api/s/' + encodeURIComponent(slug) + '/guru');
  if (res.status === 404) {
    $('judul').textContent = 'Link sekolah tidak ditemukan';
    $('info').textContent = 'Periksa lagi link yang diberikan sekolah Anda.';
    return;
  }
  if (res.status === 403) {
    $('judul').textContent = 'Layanan sedang tidak aktif';
    $('info').textContent = 'Silakan hubungi admin sekolah Anda.';
    return;
  }
  if (!res.ok) {
    $('judul').textContent = 'Terjadi masalah';
    $('info').textContent = 'Coba muat ulang halaman ini sebentar lagi.';
    return;
  }
  const data = await res.json();
  namaSekolah = data.sekolah;
  $('judul').textContent = namaSekolah;
  if (data.guru.length === 0) {
    $('info').textContent = 'Belum ada guru terdaftar. Silakan hubungi admin sekolah.';
    return;
  }
  data.guru.forEach((g) => {
    const o = document.createElement('option');
    o.value = g.id;
    o.textContent = g.nama;
    $('guru').appendChild(o);
  });

  // sudah punya sesi untuk sekolah ini? langsung lanjut tanpa PIN
  const p = await fetch('/api/profil-guru');
  if (p.ok) {
    const profil = await p.json();
    if (profil.slug === slug) {
      await lanjut(profil.nama);
      return;
    }
  }
  $('form').hidden = false;
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  tampil('');
  $('tombol').disabled = true;
  try {
    const res = await fetch('/api/s/' + encodeURIComponent(slug) + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guruId: $('guru').value, pin: $('pin').value }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      $('pin').value = '';
      await lanjut($('guru').options[$('guru').selectedIndex].textContent);
      return;
    }
    if (res.status === 401) tampil('Nama atau PIN salah. Periksa lagi ya.');
    else if (res.status === 429) tampil('Terlalu banyak percobaan. Coba lagi 15 menit lagi.');
    else if (res.status === 403) tampil(data.error || 'Layanan sedang tidak aktif.');
    else tampil('Pilih nama dan isi PIN 6 digit.');
  } catch (err) {
    tampil('Tidak bisa terhubung. Periksa koneksi internet Anda.');
  }
  $('tombol').disabled = false;
});

$('cek').addEventListener('change', () => {
  $('tombolSetuju').disabled = !$('cek').checked;
});

$('tombolSetuju').addEventListener('click', async () => {
  $('pesanSetuju').textContent = '';
  $('tombolSetuju').disabled = true;
  try {
    const res = await fetch('/api/persetujuan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setuju: true, versi: versiTeks }),
    });
    if (res.ok) {
      await tampilAbsen();
      return;
    }
    const data = await res.json().catch(() => ({}));
    $('pesanSetuju').textContent = data.error || 'Gagal menyimpan persetujuan.';
  } catch (err) {
    $('pesanSetuju').textContent = 'Tidak bisa terhubung. Periksa koneksi internet Anda.';
  }
  $('tombolSetuju').disabled = !$('cek').checked;
});

$('inputSelfie').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = ''; // supaya memilih foto yang sama lagi tetap memicu event
  if (!file) return;
  $('infoFoto').textContent = 'Memproses foto...';
  try {
    fotoBlob = await perkecil(file);
    $('pratinjau').hidden = false;
    $('infoFoto').textContent =
      'Foto siap (' + Math.round(fotoBlob.size / 1024) + ' KB). Ketuk "Ambil selfie" lagi kalau ingin mengulang.';
  } catch (err) {
    resetFoto();
    $('infoFoto').textContent = 'File yang dipilih bukan foto. Coba lagi.';
  }
  aturTombol();
});

$('btnMasuk').addEventListener('click', () => kirimAbsen('masuk'));
$('btnPulang').addEventListener('click', () => kirimAbsen('pulang'));

// kembali ke layar pilih guru dan PIN: sesi di server dihapus supaya perangkat bisa dipakai guru lain
async function keluar() {
  if (sibuk) return;
  const pesan = $('setuju').hidden ? $('pesanAbsen') : $('pesanSetuju');
  let res = null;
  try {
    res = await fetch('/api/s/' + encodeURIComponent(slug) + '/logout', { method: 'POST' });
  } catch (e) {
    res = null;
  }
  if (!res || !res.ok) {
    pesan.textContent = 'Tidak bisa keluar. Periksa koneksi internet Anda.';
    pesan.className = 'err';
    return;
  }
  resetFoto();
  keadaan = { masuk: false, pulang: false };
  selfieWajib = false;
  pesanAbsen('', false);
  $('pesanSetuju').textContent = '';
  $('cek').checked = false;
  $('tombolSetuju').disabled = true;
  $('guru').value = '';
  $('pin').value = '';
  tampilkanLogin();
  tampil('');
}

document.querySelectorAll('.btn-keluar').forEach((b) => b.addEventListener('click', keluar));

muat();
