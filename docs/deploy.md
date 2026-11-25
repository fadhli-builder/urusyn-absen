# Catatan deploy Urusyn Absen

## Lokasi dan port
- Dev: ~/urusyn-absen, port 3002, database urusyn_absen dan urusyn_absen_test (user urusyn_user)
- Produksi: ~/urusyn-prod, port 3100 (hanya 127.0.0.1), database urusyn_prod (user urusyn_prod_user)
- Rahasia: ~/.pgpass (password database) dan ~/urusyn-prod/.env (mode 600). Tidak ada di git.

## Update versi
    cd ~/urusyn-prod
    git pull
    npm ci --omit=dev
    npm run migrate
    pm2 reload urusyn-absen
    curl -s localhost:3100/health

## Perintah harian
    pm2 list
    pm2 logs urusyn-absen --lines 50
    pm2 restart urusyn-absen

## Mengelola sekolah (jalankan dari ~/urusyn-prod)
    node scripts/buat-sekolah.js <slug> "<Nama Sekolah>"
    node scripts/atur-langganan.js <slug> --sampai YYYY-MM-DD
    node scripts/reset-password.js <slug>
    node scripts/bersihkan-foto.js --simulasi

## Jangan
- Jangan jalankan scripts/seed.js di produksi (isinya data palsu).
- Jangan jalankan npm test di folder produksi (tes mengosongkan tabel).
- Jangan buka http://localhost:3100 di browser (mode produksi memaksa HTTPS). Pakai domain.
