const angka = (id) => {
  const v = $(id).value.trim();
  return v === '' ? undefined : Number(v);
};

function pesanPengaturan(teks, sukses) {
  $('pesanPengaturan').textContent = teks;
  $('pesanPengaturan').className = sukses ? 'err ok' : 'err';
}

async function muatPengaturan() {
  const res = await api('/api/pengaturan');
  if (!res.ok) {
    pesanPengaturan(res.status === 403 ? 'Ganti password dulu.' : 'Gagal memuat pengaturan.', false);
    return;
  }
  const p = await res.json();
  $('lat').value = p.lat ?? '';
  $('lng').value = p.lng ?? '';
  $('radius').value = p.radius_m ?? '';
  $('jamMasuk').value = p.jam_masuk ? p.jam_masuk.slice(0, 5) : '';
  $('toleransi').value = p.toleransi_menit ?? '';
  $('akurasi').value = p.akurasi_maks_m ?? '';
  $('selfie').checked = p.selfie_aktif;
}

$('pakaiLokasi').addEventListener('click', () => {
  const info = $('infoLokasi');
  if (!navigator.geolocation) {
    info.textContent = 'Browser ini tidak mendukung lokasi. Isi manual ya.';
    return;
  }
  info.textContent = 'Mencari lokasi...';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      $('lat').value = pos.coords.latitude.toFixed(6);
      $('lng').value = pos.coords.longitude.toFixed(6);
      info.textContent =
        'Lokasi terisi (akurasi sekitar ' + Math.round(pos.coords.accuracy) + ' m). Klik Simpan untuk menyimpan.';
    },
    () => {
      info.textContent = 'Tidak bisa mengambil lokasi. Izinkan akses lokasi di browser, atau isi manual.';
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
});

$('formPengaturan').addEventListener('submit', async (e) => {
  e.preventDefault();
  pesanPengaturan('', false);
  const body = {
    lat: angka('lat'),
    lng: angka('lng'),
    radius_m: angka('radius'),
    jam_masuk: $('jamMasuk').value || undefined,
    toleransi_menit: angka('toleransi'),
    akurasi_maks_m: angka('akurasi'),
    selfie_aktif: $('selfie').checked,
  };
  const res = await api('/api/pengaturan', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) pesanPengaturan('Pengaturan disimpan.', true);
  else pesanPengaturan((data.detail && data.detail[0]) || data.error || 'Gagal menyimpan.', false);
});

$('formGantiPw').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pesan = $('pesanGantiPw');
  pesan.textContent = '';
  pesan.className = 'err';
  if ($('pw2Baru').value !== $('pw2Ulang').value) {
    pesan.textContent = 'Password baru dan pengulangannya tidak sama.';
    return;
  }
  const res = await api('/api/ganti-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passwordLama: $('pw2Lama').value, passwordBaru: $('pw2Baru').value }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    $('formGantiPw').reset();
    pesan.textContent = 'Password berhasil diganti.';
    pesan.className = 'err ok';
  } else if (res.status === 429) {
    pesan.textContent = 'Terlalu banyak percobaan gagal. Coba lagi 15 menit lagi.';
  } else {
    pesan.textContent = data.error || 'Gagal mengganti password.';
  }
});

window.addEventListener('hashchange', () => {
  if (location.hash === '#pengaturan') muatPengaturan();
});
if (location.hash === '#pengaturan') muatPengaturan();
