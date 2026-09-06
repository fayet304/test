/* ============================================================
   JL GROUP — Employee Management System
   config.js — Konfigurasi global aplikasi

   File ini di-load SEBELUM app.js. Nilai di sini berlaku untuk
   SEMUA orang yang membuka situs GitHub Pages ini (tidak
   tersimpan per-browser), sehingga karyawan tidak perlu
   mengatur apa pun secara manual di perangkat masing-masing.

   CARA PAKAI:
   1. Deploy Code.gs sebagai Web App (lihat PANDUAN_DEPLOYMENT.md).
   2. Salin URL /exec yang diberikan Google.
   3. Tempel di bawah, ganti nilai GAS_URL.
   4. Commit & push file ini ke GitHub Pages.

   Admin tetap bisa override URL ini sementara (misalnya untuk
   testing backend lain) lewat Menu Pengaturan di dalam aplikasi
   — override tersebut hanya berlaku di browser admin itu sendiri
   dan tidak memengaruhi karyawan lain.
   ============================================================ */

const JLG_CONFIG = {
  // Ganti dengan URL Web App Google Apps Script Anda, contoh:
  // "https://script.google.com/macros/s/AKfycbxf8vXqrgyDzH7g_nuAOTqV5zdZLHUiJ4muSZvv_xcOHrUPBEytRmzcnm_mDpdF2OslRQ/exec"
  GAS_URL: "https://script.google.com/macros/s/AKfycbxf8vXqrgyDzH7g_nuAOTqV5zdZLHUiJ4muSZvv_xcOHrUPBEytRmzcnm_mDpdF2OslRQ/exec",

  // Nama perusahaan yang tampil di header/judul (opsional, bisa dikustom)
  COMPANY_NAME: "JL GROUP"
};
