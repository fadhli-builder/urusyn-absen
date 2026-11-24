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

function bukaFoto(absensiId, nama) {
  $('judulFoto').textContent = 'Selfie ' + nama;
  $('imgFoto').src = '/api/foto/' + encodeURIComponent(absensiId);
  $('modalFoto').showModal();
}

async function muatDashboard() {
  const res = await api('/api/rekap/hari-ini');
  if (!res.ok) return; // misalnya belum ganti password
  const d = await res.json();

  $('tanggalDash').textContent = new Date(d.tanggal + 'T00:00:00+07:00').toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const r = d.ringkasan;
  $('kartuRingkasan').replaceChildren(
    kartu('Guru aktif', r.total),
    kartu('Sudah absen', r.sudahAbsen),
    kartu('Telat', r.telat),
    kartu('Belum absen', r.belum)
  );

  const sudah = [
    ...d.hadir.map((x) => ({ ...x, status: 'hadir' })),
    ...d.telat.map((x) => ({ ...x, status: 'telat' })),
  ].sort((a, b) => a.nama.localeCompare(b.nama));

  const baris = sudah.map((x) => {
    const tr = el('tr');
    const status = el('td');
    status.append(el('span', x.status === 'telat' ? 'Telat' : 'Hadir', 'lencana ' + x.status));
    const foto = el('td');
    if (x.adaFoto) {
      const b = el('button', 'Lihat', 'btn kecil o');
      b.type = 'button';
      b.addEventListener('click', () => bukaFoto(x.absensiId, x.nama));
      foto.append(b);
    } else {
      foto.textContent = '-';
    }
    tr.append(el('td', x.nama), status, el('td', jamWIB(x.jamMasuk)), el('td', jamWIB(x.jamPulang)), foto);
    return tr;
  });
  $('tabelHadir').replaceChildren(...(baris.length ? baris : [barisKosong('Belum ada yang absen hari ini.', 5)]));

  $('daftarBelum').replaceChildren(
    ...(d.belum.length
      ? d.belum.map((b) => el('span', b.nama, 'chip'))
      : [document.createTextNode('Semua guru aktif sudah absen.')])
  );
}

$('tutupFoto').addEventListener('click', () => {
  $('imgFoto').removeAttribute('src');
  $('modalFoto').close();
});

window.addEventListener('hashchange', () => {
  if (location.hash === '' || location.hash === '#dashboard') muatDashboard();
});
if (location.hash === '' || location.hash === '#dashboard') muatDashboard();
