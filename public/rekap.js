const POLA_BULAN = /^20\d{2}-(0[1-9]|1[0-2])$/;

$('inputBulan').value = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 7);

async function muatRekap() {
  const bulan = $('inputBulan').value;
  $('pesanRekap').textContent = '';
  if (!POLA_BULAN.test(bulan)) {
    $('pesanRekap').textContent = 'Pilih bulan dulu.';
    return;
  }
  const res = await api('/api/rekap/bulan?bulan=' + encodeURIComponent(bulan));
  if (!res.ok) {
    $('pesanRekap').textContent = 'Gagal memuat rekap.';
    return;
  }
  const d = await res.json();

  const kepala = el('tr');
  kepala.append(el('th', 'Guru'));
  for (let h = 1; h <= d.jumlahHari; h++) kepala.append(el('th', h));
  kepala.append(el('th', 'H'), el('th', 'T'));
  $('headRekap').replaceChildren(kepala);

  const baris = d.guru.map((g) => {
    const tr = el('tr');
    tr.append(el('td', g.aktif ? g.nama : g.nama + ' (nonaktif)'));
    for (let h = 1; h <= d.jumlahHari; h++) {
      const x = g.hari[h];
      const huruf = x ? (x.status === 'telat' ? 'T' : 'H') : '';
      tr.append(el('td', huruf, huruf));
    }
    tr.append(el('td', g.hadir), el('td', g.telat));
    return tr;
  });
  if (baris.length === 0) {
    const tr = el('tr');
    const td = el('td', 'Belum ada data guru.', 'mu');
    td.colSpan = d.jumlahHari + 3;
    tr.append(td);
    baris.push(tr);
  }
  $('bodyRekap').replaceChildren(...baris);
}

$('btnTampil').addEventListener('click', muatRekap);
$('inputBulan').addEventListener('change', muatRekap);

$('btnCsv').addEventListener('click', () => {
  const bulan = $('inputBulan').value;
  if (!POLA_BULAN.test(bulan)) {
    $('pesanRekap').textContent = 'Pilih bulan dulu.';
    return;
  }
  window.location.href = '/api/rekap/csv?bulan=' + encodeURIComponent(bulan);
});

window.addEventListener('hashchange', () => {
  if (location.hash === '#rekap') muatRekap();
});
if (location.hash === '#rekap') muatRekap();
