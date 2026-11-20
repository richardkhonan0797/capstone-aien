# Setup lokal Senja Tas

Panduan ini untuk instance baru, terpisah dari deployment pemilik. Tidak diperlukan SSH key atau password server pemilik. Gunakan PowerShell dari root repository, Docker Desktop/Compose, Node.js 24 dan npm.

## 1. Jalankan n8n dan PostgreSQL

```powershell
Copy-Item .env.example .env
```

Isi `POSTGRES_PASSWORD`, `N8N_ENCRYPTION_KEY`, dan `N8N_RUNNERS_AUTH_TOKEN` dengan tiga nilai acak berbeda. Untuk menghasilkan satu nilai, jalankan ini tiga kali:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
$rng.Dispose()
```

Pertahankan pengaturan localhost dari contoh. Jangan mengganti encryption key setelah kredensial tersimpan.

```powershell
docker compose config --quiet
docker compose up -d
docker compose ps
```

Buka `http://localhost:5678` dan buat akun n8n lokal. PostgreSQL berada di hostname `postgres`, port `5432` dari container n8n. Compose juga mempublikasikan port database 5432 pada host; gunakan mesin pengembangan privat dan jangan membuka port ini ke internet. Jika port tersebut sudah digunakan, ubah binding host pada compose sebelum startup.

## 2. Siapkan database aplikasi baru

**Hanya untuk database baru:** `data/schema.sql` menghapus schema `retail` beserta isinya. Jangan jalankan terhadap database deployment atau data yang ingin disimpan. Nilai berikut menggunakan default `POSTGRES_USER=n8n` dan `POSTGRES_DB=n8n`; sesuaikan jika mengubah `.env`.

```powershell
docker compose exec -T postgres psql -U n8n -d n8n -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS vector;'
Get-Content -Raw -Encoding utf8 data/schema.sql | docker compose exec -T postgres psql -U n8n -d n8n -v ON_ERROR_STOP=1
Get-Content -Raw -Encoding utf8 data/seed.sql | docker compose exec -T postgres psql -U n8n -d n8n -v ON_ERROR_STOP=1
```

Periksa exit code setiap perintah sebelum melanjutkan. Seed berisi 30 produk, 5 dokumen, dan 20 pertanyaan; tabel pesanan awalnya kosong.

## 3. Import dan konfigurasi workflow

Import JSON dari `workflows/` melalui editor n8n. Export memuat referensi credential dari instance asal, bukan credential yang bisa digunakan pada mesin baru. Pilih kembali credential di setiap node terkait:

| Credential | Pengaturan lokal |
| --- | --- |
| PostgreSQL | Host `postgres`, port `5432`, database/user sesuai `.env`, password milik sendiri, SSL dimatikan untuk jaringan Compose lokal |
| OpenAI | API key milik sendiri dengan akses model yang dipakai node chat, vision, embedding, evaluator, dan voice bila diaktifkan |
| Telegram | Token bot milik sendiri untuk Entry Telegram dan notifikasi owner |

Gunakan database dan search path yang sama di semua node PostgreSQL. Query aplikasi memakai `retail.*`; tabel vektor `retail_katalog` dan memori `retail_chat_histories` tidak memakai schema eksplisit. Jangan membuat tabel vektor manual dengan dimensi berbeda. Model embedding ingestion dan retrieval harus sama. Jika model export tidak tersedia pada akun Anda, pilih model yang tersedia dan sesuai kemampuan node; ulangi ingestion jika model embedding berubah.

Periksa node notifikasi Telegram di Chat Agent dan ganti chat ID owner dengan ID milik sendiri. Jika hanya mencoba dashboard, cukup import Dashboard API dan hubungkan credential PostgreSQL; workflow AI/Telegram tidak perlu diaktifkan.

Untuk demo lengkap:

1. Konfigurasi Ingest Katalog, lalu jalankan manual sampai selesai untuk membangun vector store.
2. Konfigurasi dan publish/aktifkan Chat Agent dan Dashboard API. URL frontend memakai `/webhook/`, bukan `/webhook-test/`.
3. Konfigurasi Evaluasi. URL internal `http://localhost:5678/webhook/chat` sesuai jika request dijalankan di container n8n yang sama. Publish/aktifkan bila ingin memanggil endpoint evaluasi.
4. Telegram bersifat opsional untuk web lokal. Untuk menerima update Telegram, diperlukan URL HTTPS publik yang menjangkau n8n dan pengaturan `WEBHOOK_URL` yang sesuai. Gunakan bot terpisah agar callback bot deployment tidak terganti.
5. Voice opsional: konfigurasi Realtime Token dan baca [panduan voice](voice-demo.md). Token/API administratif pada server publik harus tetap dilindungi; localhost untuk pengembangan hanya diakses dari mesin sendiri.

## 4. Jalankan frontend

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Buka `http://127.0.0.1:5173/dashboard/` dan `http://127.0.0.1:5173/chat/`. `N8N_PROXY_TARGET=http://127.0.0.1:5678` mengarahkan proxy development ke backend lokal. Mengganti target ke deployment owner tidak otomatis memberikan akses administratif.

Dashboard kosong tanpa pesanan adalah hasil yang valid; kartu evaluasi baru berisi hasil setelah evaluasi dijalankan. `npm run preview` hanya untuk preview build statis, bukan pengganti proxy backend development.

## 5. Verifikasi

Dari root repository, setelah Dashboard API aktif:

```powershell
Invoke-RestMethod http://localhost:5678/webhook/pesanan
Invoke-RestMethod http://localhost:5678/webhook/tanpa-jawaban
Invoke-RestMethod http://localhost:5678/webhook/skor
```

Setelah ingestion dan Chat Agent siap, tanyakan produk/harga/stok di web chat, uji foto dari `data/foto/`, lalu buat pesanan dengan identitas fiktif dan konfirmasi. Periksa pesanan pada dashboard. Uji pertanyaan di luar katalog dan pastikan hasil yang relevan tercatat. Jalankan Evaluasi dari editor dan tunggu workflow selesai; periksa jumlah hasil di dashboard sebelum menyebut skor.

```powershell
cd frontend
npm test
npm run build
```

Jika mendapat 404, periksa path dan status published/active workflow. Jika 401, periksa apakah proxy masih menuju server owner. Jika 500, lihat execution n8n dan koneksi database/credential. Jika retrieval kosong, periksa ingestion, model embedding, dan database yang dipakai.

## Menghentikan

```powershell
docker compose down
```

Volume tetap tersimpan. `docker compose down -v` menghapus volume beserta data. Prosedur ini mendokumentasikan konfigurasi source; hasil tes frontend tidak membuktikan fresh install AI/Telegram end-to-end tanpa kredensial layanan sendiri.
