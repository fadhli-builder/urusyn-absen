-- Pengaturan gaji per guru, diatur admin sekolah.
-- Default 0: gaji baru terhitung setelah admin mengisi pertemuan per hari dan tarif.
ALTER TABLE guru
  ADD COLUMN pertemuan_per_hari INTEGER NOT NULL DEFAULT 0
    CHECK (pertemuan_per_hari BETWEEN 0 AND 20),
  ADD COLUMN tarif_per_pertemuan INTEGER NOT NULL DEFAULT 0
    CHECK (tarif_per_pertemuan BETWEEN 0 AND 10000000);
