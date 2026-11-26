(function () {
  const sisi = document.querySelector('.side');
  const burger = document.getElementById('burger');
  const tirai = document.getElementById('tirai');
  const panel = document.getElementById('panelMenu');
  if (!sisi || !burger || !tirai || !panel) return;

  const terbuka = () => sisi.classList.contains('buka');

  function atur(buka) {
    sisi.classList.toggle('buka', buka);
    burger.setAttribute('aria-expanded', String(buka));
    burger.setAttribute('aria-label', buka ? 'Tutup menu' : 'Buka menu');
    tirai.hidden = !buka;
    document.body.classList.toggle('kunci', buka);
  }

  burger.addEventListener('click', () => atur(!terbuka()));
  tirai.addEventListener('click', () => atur(false));

  // memilih menu menutup panel
  panel.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('a')) atur(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && terbuka()) {
      atur(false);
      burger.focus();
    }
  });

  window.addEventListener('hashchange', () => atur(false));

  // layar diputar atau dilebarkan ke ukuran desktop: reset
  if (window.matchMedia) {
    const lebar = window.matchMedia('(min-width: 801px)');
    const reset = () => {
      if (lebar.matches) atur(false);
    };
    if (lebar.addEventListener) lebar.addEventListener('change', reset);
    else if (lebar.addListener) lebar.addListener(reset);
  }
})();
