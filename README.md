# AbsensiGlass — Panel Dashboard Absensi Karyawan

Dashboard absensi karyawan dengan gaya **Modern Glassmorphism**, dibangun dengan
React + Vite + Tailwind CSS + Framer Motion + Recharts + Lucide React.

## Cara menjalankan

1. Pastikan Node.js versi 18 ke atas sudah terpasang.
2. Buka folder ini di terminal, lalu jalankan:

   ```bash
   npm install
   npm run dev
   ```

3. Buka `http://localhost:5173` di browser.

## Build untuk produksi

```bash
npm run build
npm run preview
```

Hasil build berada di folder `dist/`, siap diunggah ke hosting statis
(Vercel, Netlify, atau server sendiri).

## Struktur project

```
absensi-glass/
├─ index.html          # entry HTML, dimuat oleh Vite
├─ package.json        # daftar dependency
├─ vite.config.js       # konfigurasi Vite + plugin React
├─ tailwind.config.js   # konfigurasi Tailwind CSS
├─ postcss.config.js    # konfigurasi PostCSS
└─ src/
   ├─ main.jsx          # render <App /> ke #root
   ├─ index.css         # import Tailwind + scrollbar custom
   └─ App.jsx           # seluruh komponen dashboard (lihat penjelasan di bawah)
```

## Struktur komponen di dalam `App.jsx`

| Komponen | Fungsi |
|---|---|
| `LoginPage` | Halaman login glassmorphism penuh, toggle show/hide password, tombol glow |
| `Sidebar` / `Topbar` | Navigasi utama dengan pill aktif animasi + pencarian & notifikasi |
| `DashboardPage` | Kartu statistik, grafik real-time (Recharts), Quick Action clock-in/out |
| `DataKaryawanPage` | Tabel data karyawan (profil, NIK, jabatan, status, akses) |
| `AktivitasAbsenPage` + `PhotoModal` | Log presensi masuk/pulang, klik baris untuk lihat foto & GPS di pop-up |
| `AktivitasHarianPage` | Tombol status aktivitas + timer stopwatch dengan cincin progres |
| `RiwayatPage` | Rekap durasi aktivitas harian dengan indikator warna jika melebihi batas |
| `OtoritasPage` | Matriks hak akses Admin / HRD / Supervisor / Karyawan |
| `PengaturanPage` | Konfigurasi toleransi waktu & profil perusahaan |
| `LogoutModal` | Konfirmasi keluar dengan pop-up transparan |

## Menghubungkan ke backend sungguhan

Semua data saat ini masih berupa **mock data** (di bagian atas `App.jsx`:
`EMPLOYEES`, `ABSEN_LOG`, `CHART_DATA`, `ACTIVITY_OPTIONS`, `RIWAYAT`, `ROLE_MATRIX`).
Ganti array-array tersebut dengan hasil `fetch`/`axios` ke API Anda, dan
ganti fungsi `onLogin` di `LoginPage` dengan pemanggilan endpoint autentikasi
sungguhan (JWT/session) sebelum digunakan di lingkungan produksi.
