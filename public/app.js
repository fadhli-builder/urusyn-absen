const TAB = ['dashboard', 'guru', 'rekap', 'gaji', 'pengaturan'];
const $ = (id) => document.getElementById(id);

// escape sebelum teks dari server masuk ke innerHTML (cegah XSS)
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(url, opsi) {
  const res = await fetch(url, opsi);
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('belum login');
  }
  return res;
}

function tampilTab() {
  const dipilih = TAB.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
  TAB.forEach((t) => {
    $('tab-' + t).hidden = t !== dipilih;
    document.querySelector('[data-tab="' + t + '"]').classList.toggle('on', t === dipilih);
  });
}

function pasangBanner(berlakuSampai) {
  if (!berlakuSampai) return;
  const sisa = Math.ceil((new Date(berlakuSampai + 'T23:59:59+07:00') - Date.now()) / 86400000);
  if (sisa <= 7) {
    $('banner').innerHTML =
      'Langganan berlaku sampai <b>' + esc(berlakuSampai) + '</b>. Hubungi Urusyn untuk memperpanjang.';
    $('banner').hidden = false;
  }
}

async function mulai() {
  const res = await api('/api/saya');
  const s = await res.json();
  $('namaSekolah').textContent = s.nama;

  if (s.harusGantiPassword) {
    $('menu').hidden = true;
    $('tab-ganti').hidden = false;
    return;
  }

  const link = location.origin + '/s/' + s.slug;
  $('linkGuru').textContent = link;
  $('bukaLink').href = link;
  $('salinLink').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
      $('salinLink').textContent = 'Tersalin';
    } catch {
      $('salinLink').textContent = 'Gagal, salin manual';
    }
    setTimeout(() => {
      $('salinLink').textContent = 'Salin link';
    }, 2000);
  });
  pasangBanner(s.berlaku_sampai);
  window.addEventListener('hashchange', tampilTab);
  tampilTab();
}

$('formGanti').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pesan = $('pesanGanti');
  pesan.textContent = '';
  if ($('pBaru').value !== $('pUlang').value) {
    pesan.textContent = 'Password baru dan pengulangannya tidak sama.';
    return;
  }
  const res = await api('/api/ganti-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passwordLama: $('pLama').value, passwordBaru: $('pBaru').value }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    window.location.href = '/app#dashboard';
    window.location.reload();
    return;
  }
  pesan.textContent = data.error || 'Gagal mengganti password. Coba lagi.';
});

$('keluar').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login';
});

mulai();
