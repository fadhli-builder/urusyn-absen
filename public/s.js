const slug = location.pathname.split('/')[2] || '';
const $ = (id) => document.getElementById(id);
let versiTeks = '';

function tampil(teks) {
  $('pesan').textContent = teks; // textContent, aman dari XSS
}

function layarSiap() {
  $('form').hidden = true;
  $('setuju').hidden = true;
  $('info').textContent = 'Persetujuan tercatat. Tombol absen akan muncul di sini.';
}

async function cekPersetujuan() {
  const res = await fetch('/api/persetujuan');
  if (!res.ok) {
    $('info').textContent = 'Terjadi masalah. Muat ulang halaman ini.';
    return;
  }
  const data = await res.json();
  if (data.sudah) {
    layarSiap();
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
  $('judul').textContent = data.sekolah;
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
      const nama = $('guru').options[$('guru').selectedIndex].textContent;
      $('form').hidden = true;
      $('judul').textContent = 'Halo, ' + nama;
      $('info').textContent = '';
      await cekPersetujuan();
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
      layarSiap();
      return;
    }
    const data = await res.json().catch(() => ({}));
    $('pesanSetuju').textContent = data.error || 'Gagal menyimpan persetujuan.';
  } catch (err) {
    $('pesanSetuju').textContent = 'Tidak bisa terhubung. Periksa koneksi internet Anda.';
  }
  $('tombolSetuju').disabled = !$('cek').checked;
});

muat();
