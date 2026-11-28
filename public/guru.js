let guruPinId = null;
let guruPinNama = '';

function pesanGuru(teks, sukses) {
  $('pesanGuru').textContent = teks;
  $('pesanGuru').className = sukses ? 'err ok' : 'err';
}

function bukaModalPin(id, nama) {
  guruPinId = id;
  guruPinNama = nama;
  $('judulPin').textContent = 'Ubah PIN untuk ' + nama;
  $('pinBaru').value = '';
  $('pesanPin').textContent = '';
  $('modalPin').showModal();
  $('pinBaru').focus();
}

function tutupModalPin() {
  $('pinBaru').value = ''; // jangan biarkan PIN tertinggal di layar
  $('modalPin').close();
  guruPinId = null;
}

async function muatGuru() {
  const tbody = $('tabelGuru');
  const res = await api('/api/guru');
  if (!res.ok) {
    pesanGuru(res.status === 403 ? 'Ganti password dulu.' : 'Gagal memuat daftar guru.', false);
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
        '<button class="btn kecil o" type="button" data-aksi="pin" data-id="' + esc(g.id) + '">Ubah PIN</button>' +
        '<button class="btn kecil o" type="button" data-aksi="toggle" data-id="' + esc(g.id) +
        '" data-aktif="' + g.aktif + '">' + (g.aktif ? 'Nonaktifkan' : 'Aktifkan') + '</button>' +
        '</td></tr>'
    )
    .join('');
}

$('formGuru').addEventListener('submit', async (e) => {
  e.preventDefault();
  pesanGuru('', false);
  const nama = $('namaGuru').value.trim();
  const pin = $('pinGuru').value.trim();
  const res = await api('/api/guru', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nama, pin }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 201) {
    $('namaGuru').value = '';
    $('pinGuru').value = '';
    pesanGuru('Guru "' + data.nama + '" ditambahkan. Berikan PIN yang tadi Anda buat kepada guru tersebut.', true);
    muatGuru();
  } else if (res.status === 409) {
    pesanGuru('Nama guru itu sudah ada. Tambahkan pembeda, misalnya inisial.', false);
  } else {
    pesanGuru(data.error || 'Gagal menambah guru.', false);
  }
});

$('tabelGuru').addEventListener('click', async (e) => {
  const tombol = e.target.closest('button[data-aksi]');
  if (!tombol) return;
  const id = tombol.dataset.id;
  const nama = tombol.closest('tr').firstElementChild.textContent;
  pesanGuru('', false);

  if (tombol.dataset.aksi === 'pin') {
    bukaModalPin(id, nama);
  }

  if (tombol.dataset.aksi === 'toggle') {
    const aktifBaru = tombol.dataset.aktif !== 'true';
    const res = await api('/api/guru/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktif: aktifBaru }),
    });
    if (res.ok) muatGuru();
    else pesanGuru('Gagal mengubah status guru.', false);
  }
});

$('formPin').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('pesanPin').textContent = '';
  const res = await api('/api/guru/' + encodeURIComponent(guruPinId) + '/pin', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: $('pinBaru').value.trim() }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    const nama = guruPinNama;
    tutupModalPin();
    pesanGuru('PIN untuk ' + nama + ' sudah diganti. PIN yang lama langsung tidak berlaku.', true);
  } else {
    $('pesanPin').textContent = data.error || 'Gagal menyimpan PIN.';
  }
});

$('batalPin').addEventListener('click', tutupModalPin);

window.addEventListener('hashchange', () => {
  if (location.hash === '#guru') muatGuru();
});
if (location.hash === '#guru') muatGuru();
