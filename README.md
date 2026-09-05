# AbsensiKita — Aplikasi Web Absensi Karyawan

Aplikasi absensi karyawan berbasis HTML + Tailwind CSS + JavaScript (frontend),
dengan Google Sheets sebagai database dan Google Apps Script (GAS) sebagai API
backend. Di-hosting gratis lewat GitHub Pages.

## Struktur File

```
absensi-app/
├── index.html     # Struktur halaman (SPA: Dashboard, Absen/Izin, Riwayat, Admin)
├── style.css      # Kelas kustom pelengkap Tailwind
├── config.js      # Tempat mengisi URL Web App Google Apps Script
├── app.js         # Seluruh logika frontend
├── Code.gs        # Kode backend Google Apps Script
└── README.md      # Panduan ini
```

---

## LANGKAH 1 — Setup Google Sheets + Apps Script

1. Buka [sheets.google.com](https://sheets.google.com) → buat **Spreadsheet baru**,
   beri nama misalnya `Database Absensi Karyawan`.
2. Di menu, klik **Extensions → Apps Script**. Akan terbuka editor Apps Script
   yang otomatis terhubung ke spreadsheet ini.
3. Hapus semua isi file `Code.gs` bawaan, lalu **copy-paste seluruh isi file
   `Code.gs`** dari paket ini ke sana.
4. Simpan project (ikon disket / Ctrl+S). Beri nama project, misal `API Absensi`.
5. Di dropdown fungsi (di sebelah tombol ▷ Run), pilih fungsi **`initSetup`**,
   lalu klik **Run**.
   - Saat pertama kali menjalankan, Google akan meminta otorisasi izin akses
     ke Spreadsheet Anda. Klik **Review permissions** → pilih akun Anda →
     klik **Advanced** → **Go to (nama project) (unsafe)** → **Allow**.
   - Setelah berhasil, kembali ke Spreadsheet — akan otomatis muncul 3 sheet:
     `Karyawan`, `Absensi`, dan `Pengaturan`, lengkap dengan data contoh dan
     pengaturan default.
6. **Sangat disarankan**: buka sheet `Pengaturan`, lalu ganti nilai baris
   `adminUsername` dan `adminPassword` dengan kredensial Anda sendiri
   (jangan biarkan `admin` / `admin123`).

---

## LANGKAH 2 — Deploy Apps Script sebagai Web App (API)

1. Masih di editor Apps Script, klik tombol **Deploy** (kanan atas) →
   **New deployment**.
2. Klik ikon gerigi ⚙ di samping "Select type" → pilih **Web app**.
3. Isi form deployment:
   - **Description**: `API Absensi v1` (bebas)
   - **Execute as**: `Me (email Anda)`
   - **Who has access**: **`Anyone`**
     (Wajib dipilih `Anyone`, bukan "Anyone with Google account", agar
     GitHub Pages/karyawan bisa mengakses API tanpa login Google.)
4. Klik **Deploy**. Google akan kembali meminta otorisasi izin — setujui
   seperti langkah sebelumnya.
5. Setelah selesai, Anda akan mendapat **Web app URL** dengan format:
   ```
   https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxx/exec
   ```
   **Salin URL ini** — akan dipakai di Langkah 3.

> **Catatan penting saat update kode:** setiap kali Anda mengubah isi
> `Code.gs` di kemudian hari, Anda harus membuat **New deployment** baru
> (atau gunakan **Manage deployments → Edit → New version**) agar
> perubahan benar-benar aktif di URL Web App.

---

## LANGKAH 3 — Hubungkan Frontend ke API

1. Buka file `config.js`.
2. Ganti nilai `API_URL` dengan Web App URL dari Langkah 2:

   ```js
   const CONFIG = {
     API_URL: 'https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxx/exec'
   };
   ```
3. Simpan file.

---

## LANGKAH 4 — Deploy ke GitHub Pages

1. Buat repository baru di GitHub, misalnya `absensi-karyawan`.
2. Upload semua file (`index.html`, `style.css`, `config.js`, `app.js`) ke
   root repository tersebut. (`Code.gs` dan `README.md` boleh ikut diupload
   sebagai dokumentasi, tidak akan mengganggu website.)
3. Di repository, buka **Settings → Pages**.
4. Pada **Source**, pilih branch `main` dan folder `/ (root)`, lalu **Save**.
5. Tunggu 1–2 menit. GitHub akan memberi URL situs, contoh:
   ```
   https://username-anda.github.io/absensi-karyawan/
   ```
6. Buka URL tersebut — aplikasi absensi Anda sudah aktif dan online.

---

## Cara Pakai Aplikasi

### Untuk Karyawan (tanpa login)
1. Buka tab **Absen / Izin**.
2. Pilih nama dari dropdown.
3. Masukkan PIN, klik **Verifikasi**.
4. Setelah PIN benar, pilih jenis aksi: **Absen Masuk**, **Absen Pulang**,
   atau **Izin Keluar**.
5. Jika **Izin Keluar**: pilih durasi dan isi alasan.
6. Aplikasi otomatis mengambil lokasi GPS (jika diizinkan browser) dan IP
   publik perangkat. Klik **Kirim Absensi**.

### Untuk Supervisor (Admin)
1. Buka tab **Admin**, login dengan username & password dari sheet
   `Pengaturan`.
2. Kelola:
   - **Shift** — jam masuk/pulang standar.
   - **Izin** — jatah izin bulanan & daftar pilihan durasi izin.
   - **Kelola Karyawan** — tambah karyawan baru, reset PIN, aktif/nonaktifkan.
   - **Keamanan IP** — daftar IP kantor yang diizinkan (kosongkan untuk
     menonaktifkan pembatasan).
   - **Pengumuman** — broadcast pesan yang tampil di halaman depan seluruh
     karyawan.

---

## Catatan Teknis & Keamanan

- **CORS**: Google Apps Script tidak mendukung `OPTIONS` preflight, sehingga
  `app.js` mengirim request `POST` dengan header `Content-Type: text/plain`
  agar dianggap *simple request* oleh browser dan tidak memicu preflight.
- **PIN & Password**: pada versi ini PIN dan password admin disimpan sebagai
  teks biasa di Google Sheets untuk kesederhanaan. Untuk kebutuhan produksi/
  data sensitif, pertimbangkan menambahkan hashing (mis. SHA-256 via
  `Utilities.computeDigest`) di `Code.gs`.
- **Verifikasi IP**: karena keterbatasan Apps Script, IP publik diambil di
  sisi **browser karyawan** (via `api.ipify.org`) lalu dikirim ke server
  untuk dicocokkan dengan whitelist. Ini cukup untuk mencegah absen dari
  luar jaringan kantor pada penggunaan wajar, namun IP browser secara
  teknis bisa dimanipulasi pengguna yang punya niat teknis — gunakan sebagai
  lapisan tambahan, bukan satu-satunya kontrol keamanan.
- **Kapasitas**: Google Sheets nyaman untuk ratusan karyawan dan puluhan
  ribu baris riwayat. Untuk skala jauh lebih besar, pertimbangkan migrasi ke
  database sesungguhnya.
- **Batas kuota Apps Script**: akun Google gratis punya kuota harian untuk
  eksekusi Web App (biasanya cukup untuk penggunaan tim kecil–menengah).

---

## Kustomisasi Cepat

| Ingin mengubah...              | Edit di...                                  |
|---------------------------------|----------------------------------------------|
| Warna tema aplikasi             | `tailwind.config` di `index.html`            |
| Nama aplikasi / logo            | Bagian `<header>` di `index.html`            |
| Sheet ID / spreadsheet target   | Tidak perlu — `Code.gs` otomatis memakai spreadsheet tempat script terpasang |
| Struktur kolom Absensi/Karyawan | Fungsi `initSetup()` di `Code.gs`            |
| Zona waktu                      | Google Sheets → File → Settings → Time zone  |
