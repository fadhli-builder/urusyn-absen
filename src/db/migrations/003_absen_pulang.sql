-- absen pulang sekarang punya GPS dan selfie sendiri, sama seperti absen masuk
ALTER TABLE absensi
  ADD COLUMN lat_pulang DOUBLE PRECISION,
  ADD COLUMN lng_pulang DOUBLE PRECISION,
  ADD COLUMN akurasi_pulang_m DOUBLE PRECISION,
  ADD COLUMN foto_pulang_path TEXT,
  ADD COLUMN foto_pulang_hash TEXT;

CREATE UNIQUE INDEX absensi_foto_pulang_hash_unik
  ON absensi (sekolah_id, foto_pulang_hash)
  WHERE foto_pulang_hash IS NOT NULL;
