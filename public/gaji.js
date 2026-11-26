const POLA_BULAN_GAJI = /^20\d{2}-(0[1-9]|1[0-2])$/;
const rupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');

$('inputBulanGaji').value = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 7);

function pesanGaji(teks, sukses) {
  $('pesanGaji').textContent = teks;
  $('pesanGaji').className = sukses ? 'err ok' : 'err';
}

function namaBulan(bulan) {
  const [t, b] = bulan.split('-').map(Number);
  return new Date(Date.UTC(t, b - 1, 1)).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function buatInputGaji(g, kolom, nilai, maks) {
  const i = document.createElement('input');
  i.type = 'number';
  i.min = '0';
  i.max = String(maks);
  i.step = '1';
  i.inputMode = 'numeric';
  i.value = nilai;
  i.className = 'in-gaji';
  i.dataset.id = g.id;
  i.dataset.f = kolom;
  i.setAttribute('aria-label', (kolom === 'ppp' ? 'Pertemuan per hari ' : 'Tarif per pertemuan ') + g.nama);
  i.addEventListener('change', () => simpanGaji(g.id));
  return i;
}

const cariInput = (id, kolom) =>
  document.querySelector('#bodyGaji input[data-id="' + id + '"][data-f="' + kolom + '"]');

async function muatGaji() {
  const bulan = $('inputBulanGaji').value;
  if (!POLA_BULAN_GAJI.test(bulan)) {
    pesanGaji('Pilih bulan dulu.', false);
    return;
  }
  const res = await api('/api/gaji?bulan=' + encodeURIComponent(bulan));
  if (!res.ok) {
    pesanGaji(res.status === 403 ? 'Ganti password dulu.' : 'Gagal memuat gaji.', false);
    return;
  }
  const d = await res.json();

  // ingat kolom yang sedang difokus supaya pengetikan tidak terputus saat tabel digambar ulang
  const f = document.activeElement;
  const fokus = f && f.dataset && f.dataset.f ? { id: f.dataset.id, f: f.dataset.f } : null;

  $('periodeGaji').textContent = namaBulan(d.bulan) + ', dihitung otomatis dari absen';
  $('totalGaji').textContent = rupiah(d.total);
  $('footTotalGaji').textContent = rupiah(d.total);

  const baris = d.guru.map((g) => {
    const tr = el('tr');
    const tdPpp = el('td');
    tdPpp.append(buatInputGaji(g, 'ppp', g.pertemuanPerHari, 20));
    const tdTarif = el('td');
    tdTarif.append(buatInputGaji(g, 'tarif', g.tarif, 10000000));
    tr.append(
      el('td', g.aktif ? g.nama : g.nama + ' (nonaktif)'),
      el('td', g.hariHadir),
      tdPpp,
      el('td', g.totalPertemuan),
      tdTarif,
      el('td', rupiah(g.gaji), 'kanan')
    );
    return tr;
  });
  if (baris.length === 0) {
    const tr = el('tr');
    const td = el('td', 'Belum ada data guru.', 'mu');
    td.colSpan = 6;
    tr.append(td);
    baris.push(tr);
  }
  $('bodyGaji').replaceChildren(...baris);

  if (fokus) {
    const x = cariInput(fokus.id, fokus.f);
    if (x) x.focus();
  }
}

async function simpanGaji(id) {
  const ppp = cariInput(id, 'ppp');
  const tarif = cariInput(id, 'tarif');
  if (!ppp || !tarif) return;
  const a = Number(ppp.value);
  const b = Number(tarif.value);
  if (ppp.value === '' || tarif.value === '' || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    pesanGaji('Isi dengan bilangan bulat 0 atau lebih.', false);
    await muatGaji();
    return;
  }
  const res = await api('/api/gaji/guru/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pertemuanPerHari: a, tarif: b }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    pesanGaji(d.error || 'Gagal menyimpan.', false);
    await muatGaji();
    return;
  }
  pesanGaji('Tersimpan.', true);
  await muatGaji();
}

$('inputBulanGaji').addEventListener('change', () => {
  pesanGaji('', false);
  muatGaji();
});

$('btnCsvGaji').addEventListener('click', () => {
  const bulan = $('inputBulanGaji').value;
  if (!POLA_BULAN_GAJI.test(bulan)) {
    pesanGaji('Pilih bulan dulu.', false);
    return;
  }
  window.location.href = '/api/gaji/csv?bulan=' + encodeURIComponent(bulan);
});

window.addEventListener('hashchange', () => {
  if (location.hash === '#gaji') muatGaji();
});
if (location.hash === '#gaji') muatGaji();
