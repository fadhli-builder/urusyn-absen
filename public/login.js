const form = document.getElementById('form');
const tombol = document.getElementById('tombol');
const pesan = document.getElementById('pesan');

function tampil(teks, sukses) {
  pesan.textContent = teks; // textContent, bukan innerHTML (cegah XSS)
  pesan.className = sukses ? 'err ok' : 'err';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  tampil('', false);
  tombol.disabled = true;
  tombol.textContent = 'Memeriksa...';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sekolah: form.sekolah.value.trim().toLowerCase(),
        password: form.password.value,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      tampil('Berhasil masuk, mengalihkan...', true);
      window.location.href = data.harusGantiPassword ? '/app#ganti-password' : '/app';
      return;
    }
    if (res.status === 401) tampil('ID Sekolah atau password salah. Periksa lagi ya.', false);
    else if (res.status === 403) tampil(data.error || 'Langganan tidak aktif, hubungi Urusyn.', false);
    else if (res.status === 429) tampil('Terlalu banyak percobaan. Coba lagi 15 menit lagi.', false);
    else if (res.status === 400) tampil('Isi ID Sekolah dan password dulu.', false);
    else tampil('Terjadi masalah di server. Coba lagi sebentar lagi.', false);
  } catch (err) {
    tampil('Tidak bisa terhubung. Periksa koneksi internet lu.', false);
  }

  tombol.disabled = false;
  tombol.textContent = 'Masuk';
});
