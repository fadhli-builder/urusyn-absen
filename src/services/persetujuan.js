// Naikkan VERSI kalau teks diubah, supaya semua guru diminta setuju ulang.
const VERSI_PERSETUJUAN = '2026-11-v2';

const TEKS_PERSETUJUAN = {
  judul: 'Persetujuan penggunaan data',
  poin: [
    'Tujuan: memastikan kehadiran Anda di sekolah dan mencatat jam masuk dan pulang.',
    'Lokasi (GPS) HP Anda dibaca hanya saat Anda menekan tombol absen.',
    'Jika sekolah mengaktifkan selfie, foto wajah Anda diambil saat absen sebagai bukti kehadiran.',
    'Data yang disimpan: nama, jam masuk dan pulang, koordinat saat absen, dan foto (jika ada).',
    'Sekolah dapat menghitung gaji Anda dari data kehadiran (hari hadir x pertemuan per hari x tarif yang diatur admin sekolah).',
    'Data hanya dapat dilihat oleh admin sekolah Anda.',
    'Lama simpan: foto dihapus otomatis setelah 90 hari. Data absensi disimpan selama sekolah Anda memakai layanan ini.',
    'Anda dapat meminta penghapusan data Anda lewat admin sekolah.',
  ],
};

module.exports = { VERSI_PERSETUJUAN, TEKS_PERSETUJUAN };
