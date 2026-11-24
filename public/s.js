const slug = location.pathname.split('/')[2] || '';
const $ = (id) => document.getElementById(id);
let versiTeks = '';
let namaSekolah = '';
let sibuk = false;

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

function tampilkanLogin(teks) {
  $('absen').hidden = true;
  $('setuju').hidden = true;
  $('form').hidden = false;
  $('tombol').disabled = false;
  $('judul').textContent = namaSekolah;
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
  $('infoSelfie').hidden = !d.selfieAktif;
  $('btnMasuk').disabled = Boolean(d.masuk) || d.selfieAktif;
  $('btnPulang').disabled = !d.masuk || Boolean(d.pulang);
}

async function kirimAbsen(jenis) {
  if (sibuk) return;
  sibuk = true;
  pesanAbsen('', false);
  const tombol = jenis === 'masuk' ? $('btnMasuk') : $('btnPulang');
  const label = tombol.textContent;
  $('btnMasuk').disabled = true;
  $('btnPulang').disabled = true;

  try {
    let body = null;
    if (jenis === 'masuk') {
      tombol.textContent = 'Mencari lokasi...';
      body = JSON.stringify(await ambilLokasi());
    }
    tombol.textContent = 'Mengirim...';
    const res = await fetch('/api/absen/' + jenis, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body,
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      tampilkanLogin('Sesi habis. Silakan masuk lagi.');
      return;
    }
    if (res.ok) {
      pesanAbsen(
        jenis === 'masuk'
          ? 'Absen masuk berhasil. Status: ' + (data.status === 'telat' ? 'Telat' : 'Hadir') +
              '. Jarak dari titik sekolah sekitar ' + data.jarak_m + ' m.'
          : 'Absen pulang berhasil. Hati-hati di jalan.',
        true
      );
    } else {
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
    await tampilAbsen(); // segarkan status dan keadaan tombol
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

$('btnMasuk').addEventListener('click', () => kirimAbsen('masuk'));
$('btnPulang').addEventListener('click', () => kirimAbsen('pulang'));

muat();
