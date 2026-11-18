CREATE TABLE sekolah (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  nama TEXT NOT NULL,
  aktif BOOLEAN NOT NULL DEFAULT true,
  berlaku_sampai DATE,
  selfie_aktif BOOLEAN NOT NULL DEFAULT true,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  radius_m INTEGER,
  jam_masuk TIME,
  toleransi_menit INTEGER,
  akurasi_maks_m INTEGER,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE akun_admin (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sekolah_id BIGINT NOT NULL REFERENCES sekolah(id),
  username TEXT NOT NULL DEFAULT 'admin',
  password_hash TEXT NOT NULL,
  harus_ganti_password BOOLEAN NOT NULL DEFAULT true,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sekolah_id, username)
);

CREATE TABLE guru (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sekolah_id BIGINT NOT NULL REFERENCES sekolah(id),
  nama TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  aktif BOOLEAN NOT NULL DEFAULT true,
  persetujuan_pada TIMESTAMPTZ,
  persetujuan_versi TEXT,
  UNIQUE (sekolah_id, nama),
  UNIQUE (sekolah_id, id)
);

CREATE TABLE absensi (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sekolah_id BIGINT NOT NULL,
  guru_id BIGINT NOT NULL,
  tanggal DATE NOT NULL,
  jam_masuk TIMESTAMPTZ NOT NULL,
  jam_pulang TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('hadir', 'telat')),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  akurasi_m DOUBLE PRECISION,
  foto_path TEXT,
  foto_hash TEXT,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guru_id, tanggal),
  FOREIGN KEY (sekolah_id, guru_id) REFERENCES guru (sekolah_id, id)
);