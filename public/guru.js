function bukaModalPin(nama, pin) {
  $('judulPin').textContent = 'PIN untuk ' + nama;
  $('isiPin').textContent = pin; // textContent, aman dari XSS
  $('modalPin').showModal();
}

async function muatGuru() {
  const tbody = $('tabelGuru');
  const res = await api('/api/guru');
  if (!res.ok) {
    $('pesanGuru').textContent = res.status === 403 ? 'Ganti password dulu.' : 'Gagal memuat daftar guru.';
    return;
  }
  const daftar = await res.json();
  if (daftar.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="mu">Belum ada guru. Tambahkan lewat form di atas.</td></tr>';
    return;
  }
  tbody.innerHTML = daftar
    .map(
      (g) =>
        '<tr><td>' + esc(g.nama) + '</td><td>' + (g.aktif ? 'Aktif' : 'Nonaktif') + '</td><td>' +
        '<button class="btn kecil o" type="button" data-aksi="pin" data-id="' + esc(g.id) + '">Reset PIN</button>' +
        '<button class="btn kecil o" type="button" data-aksi="toggle" data-id="' + esc(g.id) +
        '" data-aktif="' + g.aktif + '">' + (g.aktif ? 'Nonaktifkan' : 'Aktifkan') + '</button>' +
        '</td></tr>'
    )
    .join('');
}

$('formGuru').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('pesanGuru').textContent = '';
  const nama = $('namaGuru').value.trim();
  const res = await api('/api/guru', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nama }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 201) {
    $('namaGuru').value = '';
    bukaModalPin(data.nama, data.pin);
    muatGuru();
  } else if (res.status === 409) {
    $('pesanGuru').textContent = 'Nama guru itu sudah ada. Tambahkan pembeda, misalnya inisial.';
  } else {
    $('pesanGuru').textContent = data.error || 'Gagal menambah guru.';
  }
});

$('tabelGuru').addEventListener('click', async (e) => {
  const tombol = e.target.closest('button[data-aksi]');
  if (!tombol) return;
  const id = tombol.dataset.id;
  const nama = tombol.closest('tr').firstElementChild.textContent;
  $('pesanGuru').textContent = '';

  if (tombol.dataset.aksi === 'pin') {
    if (!confirm('Reset PIN ' + nama + '? PIN lama langsung tidak berlaku.')) return;
    const res = await api('/api/guru/' + id + '/reset-pin', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) bukaModalPin(nama, data.pin);
    else $('pesanGuru').textContent = data.error || 'Gagal reset PIN.';
  }

  if (tombol.dataset.aksi === 'toggle') {
    const aktifBaru = tombol.dataset.aktif !== 'true';
    const res = await api('/api/guru/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktif: aktifBaru }),
    });
    if (res.ok) muatGuru();
    else $('pesanGuru').textContent = 'Gagal mengubah status guru.';
  }
});

$('tutupPin').addEventListener('click', () => {
  $('isiPin').textContent = ''; // hapus PIN dari layar
  $('modalPin').close();
});

window.addEventListener('hashchange', () => {
  if (location.hash === '#guru') muatGuru();
});
if (location.hash === '#guru') muatGuru();
