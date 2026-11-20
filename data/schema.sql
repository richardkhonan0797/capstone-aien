DROP SCHEMA IF EXISTS retail CASCADE;
CREATE SCHEMA retail;

CREATE TABLE retail.produk (
  sku text PRIMARY KEY,
  nama text NOT NULL,
  kategori text NOT NULL,
  harga integer NOT NULL CHECK (harga > 0),
  stok integer NOT NULL CHECK (stok >= 0),
  deskripsi text NOT NULL,
  foto text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE retail.pesanan (
  id bigserial PRIMARY KEY,
  order_key text NOT NULL UNIQUE,          -- idempotency: md5(session|sku|qty|nama)
  session_id text NOT NULL,
  sku text NOT NULL REFERENCES retail.produk(sku),
  qty integer NOT NULL CHECK (qty > 0),
  nama_pembeli text NOT NULL,
  alamat text,
  total integer NOT NULL,
  status text NOT NULL DEFAULT 'baru',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE retail.pertanyaan_tanpa_jawaban (
  id bigserial PRIMARY KEY,
  session_id text,
  pertanyaan text NOT NULL,
  alasan text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE retail.eval_dev_set (
  id integer PRIMARY KEY,
  pertanyaan text NOT NULL,
  jenis text NOT NULL CHECK (jenis IN ('jawab','tolak')),
  jawaban_benar text NOT NULL,
  sumber_benar text
);

CREATE TABLE retail.eval_hasil (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL,
  qid integer NOT NULL,
  pertanyaan text,
  jawaban text,
  sumber text,
  benar boolean,
  bersumber boolean,
  halusinasi boolean,
  catatan text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE retail.ingest_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hash text,
  jumlah_dokumen integer,
  updated_at timestamptz DEFAULT now()
);
INSERT INTO retail.ingest_state (hash, jumlah_dokumen) VALUES ('', 0);

CREATE TABLE retail.eskalasi (
  id bigserial PRIMARY KEY,
  session_id text NOT NULL,
  ringkasan text NOT NULL,
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE retail.dokumen (
  sumber text PRIMARY KEY,
  teks text NOT NULL
);
