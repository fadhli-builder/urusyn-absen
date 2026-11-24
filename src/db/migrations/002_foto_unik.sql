CREATE UNIQUE INDEX absensi_foto_hash_unik
  ON absensi (sekolah_id, foto_hash)
  WHERE foto_hash IS NOT NULL;
