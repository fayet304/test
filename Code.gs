/**
 * ============================================================
 *  APLIKASI ABSENSI KARYAWAN - BACKEND (Google Apps Script)
 * ============================================================
 * Sheet yang dibutuhkan (dibuat otomatis oleh initSetup()):
 *   1. Karyawan  -> ID | Nama | PIN | Aktif | TanggalDaftar
 *   2. Absensi   -> Timestamp | ID | Nama | Jenis | DurasiLabel | DurasiMenit | Alasan | Latitude | Longitude | IP | Status
 *   3. Pengaturan -> Key | Value
 * ============================================================
 */

const SHEET_KARYAWAN = 'Karyawan';
const SHEET_ABSENSI = 'Absensi';
const SHEET_PENGATURAN = 'Pengaturan';

/* ------------------------------------------------------------------
 *  SETUP AWAL
 * ------------------------------------------------------------------ */
function initSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let shK = ss.getSheetByName(SHEET_KARYAWAN);
  if (!shK) shK = ss.insertSheet(SHEET_KARYAWAN);
  shK.clear();
  shK.appendRow(['ID', 'Nama', 'PIN', 'Aktif', 'TanggalDaftar']);
  shK.appendRow(['K001', 'Contoh Karyawan', '1234', true, new Date()]);

  let shA = ss.getSheetByName(SHEET_ABSENSI);
  if (!shA) shA = ss.insertSheet(SHEET_ABSENSI);
  shA.clear();
  shA.appendRow(['Timestamp', 'ID', 'Nama', 'Jenis', 'DurasiLabel', 'DurasiMenit', 'Alasan', 'Latitude', 'Longitude', 'IP', 'Status']);

  let shP = ss.getSheetByName(SHEET_PENGATURAN);
  if (!shP) shP = ss.insertSheet(SHEET_PENGATURAN);
  shP.clear();
  shP.appendRow(['Key', 'Value']);
  const defaults = [
    ['jamMasuk', '08:00'],
    ['jamPulang', '17:00'],
    ['durasiIzin', JSON.stringify([{ label: 'Keperluan Kantor', menit: 60 }, { label: 'Keperluan Pribadi', menit: 30 }, { label: 'Makan/Istirahat', menit: 45 }])],
    ['jatahIzinBulanan', '3'],
    ['ipWhitelist', JSON.stringify([])],
    ['pengumuman', 'Selamat datang di Aplikasi Absensi Karyawan!'],
    ['adminUsername', 'admin'],
    ['adminPassword', 'admin123']
  ];
  defaults.forEach(r => shP.appendRow(r));

  SpreadsheetApp.flush();
  Logger.log('Setup selesai. Sheet Karyawan, Absensi, Pengaturan sudah dibuat.');
}

/* ------------------------------------------------------------------
 *  HELPER UMUM
 * ------------------------------------------------------------------ */
function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" tidak ditemukan. Jalankan initSetup() dulu.');
  return sh;
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ok_(data) {
  return jsonOut_({ success: true, data: data });
}

function fail_(message) {
  return jsonOut_({ success: false, message: message });
}

function sheetToObjects_(sh) {
  const values = sh.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values.shift();
  return values
    .filter(row => row.join('') !== '')
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = row[i]));
      return obj;
    });
}

function getSettings_() {
  const rows = sheetToObjects_(sheet_(SHEET_PENGATURAN));
  const settings = {};
  rows.forEach(r => (settings[r.Key] = r.Value));
  return settings;
}

function setSetting_(key, value) {
  const sh = sheet_(SHEET_PENGATURAN);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === key) {
      sh.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sh.appendRow([key, value]);
}

function isAdmin_(username, password) {
  const settings = getSettings_();
  return settings.adminUsername === username && settings.adminPassword === String(password);
}

function todayStr_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT+7', 'yyyy-MM-dd');
}

function isSameDay_(date) {
  return Utilities.formatDate(new Date(date), Session.getScriptTimeZone() || 'GMT+7', 'yyyy-MM-dd') === todayStr_();
}

/* ------------------------------------------------------------------
 *  ENTRY POINTS (GET & POST)
 * ------------------------------------------------------------------ */
function doGet(e) {
  try {
    const action = e.parameter.action;
    switch (action) {
      case 'getKaryawan':
        return ok_(getKaryawanPublic_());
      case 'getDashboard':
        return ok_(getDashboard_());
      case 'getRiwayat':
        return ok_(getRiwayat_(e.parameter));
      case 'getPengaturanPublik':
        return ok_(getPengaturanPublik_());
      case 'getStatusIzin':
        return ok_(getStatusIzin_(e.parameter.id));
      case 'getIzinRanking':
        return ok_(getIzinRanking_());
      default:
        return fail_('Action tidak dikenali: ' + action);
    }
  } catch (err) {
    return fail_(err.message);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    switch (action) {
      case 'verifyPin':
        return verifyPin_(body);
      case 'absen':
        return absen_(body);
      case 'izinMulai':
        return izinMulai_(body);
      case 'izinSelesai':
        return izinSelesai_(body);
      case 'adminLogin':
        return adminLogin_(body);
      case 'adminGetKaryawan':
        return adminOnly_(body, () => ok_(sheetToObjects_(sheet_(SHEET_KARYAWAN))));
      case 'adminGetSettings':
        return adminOnly_(body, () => ok_(getSettings_()));
      case 'adminAddKaryawan':
        return adminOnly_(body, () => addKaryawan_(body));
      case 'adminEditKaryawan':
        return adminOnly_(body, () => editKaryawan_(body));
      case 'adminResetPin':
        return adminOnly_(body, () => resetPin_(body));
      case 'adminUpdateShift':
        return adminOnly_(body, () => {
          setSetting_('jamMasuk', body.jamMasuk);
          setSetting_('jamPulang', body.jamPulang);
          return ok_({});
        });
      case 'adminUpdateIzin':
        return adminOnly_(body, () => {
          setSetting_('durasiIzin', JSON.stringify(body.durasiIzin));
          setSetting_('jatahIzinBulanan', String(body.jatahIzinBulanan));
          return ok_({});
        });
      case 'adminUpdateIP':
        return adminOnly_(body, () => {
          setSetting_('ipWhitelist', JSON.stringify(body.ipWhitelist));
          return ok_({});
        });
      case 'adminBroadcast':
        return adminOnly_(body, () => {
          setSetting_('pengumuman', body.pengumuman);
          return ok_({});
        });
      default:
        return fail_('Action tidak dikenali: ' + action);
    }
  } catch (err) {
    return fail_(err.message);
  }
}

function adminOnly_(body, fn) {
  if (!isAdmin_(body.username, body.password)) return fail_('Username atau password admin salah.');
  return fn();
}

/* ------------------------------------------------------------------
 *  LOGIKA KARYAWAN
 * ------------------------------------------------------------------ */
function getKaryawanPublic_() {
  return sheetToObjects_(sheet_(SHEET_KARYAWAN))
    .filter(k => k.Aktif === true || k.Aktif === 'TRUE' || k.Aktif === 'true')
    .map(k => ({ id: k.ID, nama: k.Nama }));
}

function findKaryawanById_(sh, id) {
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return { rowIndex: i + 1, row: values[i] };
  }
  return null;
}

function addKaryawan_(body) {
  const sh = sheet_(SHEET_KARYAWAN);
  const values = sh.getDataRange().getValues();
  let maxNum = 0;
  values.slice(1).forEach(r => {
    const m = String(r[0]).match(/K(\d+)/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  });
  const newId = 'K' + String(maxNum + 1).padStart(3, '0');
  sh.appendRow([newId, body.nama, String(body.pin), true, new Date()]);
  return ok_({ id: newId });
}

function editKaryawan_(body) {
  const sh = sheet_(SHEET_KARYAWAN);
  const found = findKaryawanById_(sh, body.id);
  if (!found) return fail_('Karyawan tidak ditemukan.');
  if (body.nama !== undefined) sh.getRange(found.rowIndex, 2).setValue(body.nama);
  if (body.aktif !== undefined) sh.getRange(found.rowIndex, 4).setValue(body.aktif);
  return ok_({});
}

function resetPin_(body) {
  const sh = sheet_(SHEET_KARYAWAN);
  const found = findKaryawanById_(sh, body.id);
  if (!found) return fail_('Karyawan tidak ditemukan.');
  sh.getRange(found.rowIndex, 3).setValue(String(body.newPin));
  return ok_({});
}

/* ------------------------------------------------------------------
 *  LOGIKA ABSENSI & IZIN TIMER
 * ------------------------------------------------------------------ */
function verifyPin_(body) {
  const shK = sheet_(SHEET_KARYAWAN);
  const found = findKaryawanById_(shK, body.id);
  if (!found) return fail_('Karyawan tidak ditemukan.');
  const [, nama, pin, aktif] = found.row;
  if (aktif !== true && aktif !== 'TRUE' && aktif !== 'true') return fail_('Karyawan ini tidak aktif.');
  if (String(pin) !== String(body.pin)) return fail_('PIN salah. Silakan coba lagi.');
  return ok_({ valid: true, nama: nama });
}

function checkIpWhitelist_(ip) {
  const settings = getSettings_();
  const whitelist = JSON.parse(settings.ipWhitelist || '[]');
  if (whitelist.length > 0 && ip && whitelist.indexOf(ip) === -1) {
    throw new Error('Absen ditolak: IP Address (' + ip + ') tidak terdaftar di whitelist kantor.');
  }
}

function absen_(body) {
  const shK = sheet_(SHEET_KARYAWAN);
  const found = findKaryawanById_(shK, body.id);
  if (!found) return fail_('Karyawan tidak ditemukan.');

  const [id, nama, pin, aktif] = found.row;
  if (aktif !== true && aktif !== 'TRUE' && aktif !== 'true') return fail_('Karyawan ini tidak aktif.');
  if (String(pin) !== String(body.pin)) return fail_('PIN salah.');

  checkIpWhitelist_(body.ip);

  const shA = sheet_(SHEET_ABSENSI);
  shA.appendRow([
    new Date(),
    id,
    nama,
    body.jenis,
    '',
    '',
    '',
    body.lat || '',
    body.lng || '',
    body.ip || '',
    'Tercatat'
  ]);

  return ok_({ nama: nama, jenis: body.jenis, waktu: new Date().toISOString() });
}

function getStatusIzin_(id) {
  const rows = sheetToObjects_(sheet_(SHEET_ABSENSI));
  const lastIzin = rows
    .filter(r => String(r.ID) === String(id) && (r.Jenis === 'Izin Mulai' || r.Jenis === 'Izin Selesai'))
    .pop();

  if (lastIzin && lastIzin.Jenis === 'Izin Mulai') {
    return {
      aktif: true,
      keperluan: lastIzin.Alasan,
      mulaiWaktu: new Date(lastIzin.Timestamp).toISOString()
    };
  }
  return { aktif: false };
}

function izinMulai_(body) {
  const shK = sheet_(SHEET_KARYAWAN);
  const found = findKaryawanById_(shK, body.id);
  if (!found) return fail_('Karyawan tidak ditemukan.');

  const [id, nama, pin, aktif] = found.row;
  if (aktif !== true && aktif !== 'TRUE' && aktif !== 'true') return fail_('Karyawan ini tidak aktif.');
  if (String(pin) !== String(body.pin)) return fail_('PIN salah.');

  checkIpWhitelist_(body.ip);

  const status = getStatusIzin_(id);
  if (status.aktif) return fail_('Selesaikan izin keluar Anda yang sedang berlangsung terlebih dahulu.');

  const now = new Date();
  const shA = sheet_(SHEET_ABSENSI);
  shA.appendRow([
    now,
    id,
    nama,
    'Izin Mulai',
    '',
    '',
    body.keperluan || 'Izin Keluar',
    body.lat || '',
    body.lng || '',
    body.ip || '',
    'Berlangsung'
  ]);

  return ok_({ mulaiWaktu: now.toISOString() });
}

function izinSelesai_(body) {
  const shK = sheet_(SHEET_KARYAWAN);
  const found = findKaryawanById_(shK, body.id);
  if (!found) return fail_('Karyawan tidak ditemukan.');

  const [id, nama, pin, aktif] = found.row;
  if (aktif !== true && aktif !== 'TRUE' && aktif !== 'true') return fail_('Karyawan ini tidak aktif.');
  if (String(pin) !== String(body.pin)) return fail_('PIN salah.');

  checkIpWhitelist_(body.ip);

  const rows = sheetToObjects_(sheet_(SHEET_ABSENSI));
  const lastMulai = rows
    .filter(r => String(r.ID) === String(id) && r.Jenis === 'Izin Mulai')
    .pop();

  if (!lastMulai) return fail_('Tidak ada sesi izin keluar yang aktif.');

  const now = new Date();
  const diffMs = now.getTime() - new Date(lastMulai.Timestamp).getTime();
  const totalMenit = Math.max(1, Math.round(diffMs / 60000));
  const label = totalMenit >= 60 
    ? Math.floor(totalMenit / 60) + ' Jam ' + (totalMenit % 60) + ' Mnt'
    : totalMenit + ' Mnt';

  const shA = sheet_(SHEET_ABSENSI);
  shA.appendRow([
    now,
    id,
    nama,
    'Izin Selesai',
    label,
    totalMenit,
    lastMulai.Alasan,
    body.lat || '',
    body.lng || '',
    body.ip || '',
    'Selesai'
  ]);

  return ok_({ durasiLabel: label, durasiMenit: totalMenit });
}

/* ------------------------------------------------------------------
 *  LOGIKA DASHBOARD & RANKING
 * ------------------------------------------------------------------ */
function getDashboard_() {
  const karyawan = sheetToObjects_(sheet_(SHEET_KARYAWAN));
  const totalKaryawan = karyawan.filter(k => k.Aktif === true || k.Aktif === 'TRUE' || k.Aktif === 'true').length;

  const absensi = sheetToObjects_(sheet_(SHEET_ABSENSI)).filter(a => isSameDay_(a.Timestamp));

  const masukHariIni = {};
  const pulangHariIni = {};
  const izinState = {};

  absensi.forEach(a => {
    if (a.Jenis === 'Masuk') masukHariIni[a.ID] = true;
    if (a.Jenis === 'Pulang') pulangHariIni[a.ID] = true;
    if (a.Jenis === 'Izin Mulai') izinState[a.ID] = true;
    if (a.Jenis === 'Izin Selesai') izinState[a.ID] = false;
  });

  const izinAktif = Object.keys(izinState).filter(id => izinState[id]).length;
  const hadirHariIni = Object.keys(masukHariIni).length;

  return {
    hadirHariIni: hadirHariIni,
    sudahPulang: Object.keys(pulangHariIni).length,
    izinAktif: izinAktif,
    totalKaryawan: totalKaryawan,
    pengumuman: getSettings_().pengumuman || ''
  };
}

function getIzinRanking_() {
  const rows = sheetToObjects_(sheet_(SHEET_ABSENSI));
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const counts = {};

  rows.forEach(r => {
    if (r.Jenis === 'Izin Selesai' || r.Jenis === 'Izin Keluar') {
      const d = new Date(r.Timestamp);
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        counts[r.Nama] = (counts[r.Nama] || 0) + 1;
      }
    }
  });

  const result = Object.keys(counts).map(nama => ({
    nama: nama,
    count: counts[nama]
  }));

  result.sort((a, b) => b.count - a.count);
  return result;
}

/* ------------------------------------------------------------------
 *  LOGIKA RIWAYAT
 * ------------------------------------------------------------------ */
function getRiwayat_(params) {
  let rows = sheetToObjects_(sheet_(SHEET_ABSENSI));

  if (params.start) {
    const start = new Date(params.start + 'T00:00:00');
    rows = rows.filter(r => new Date(r.Timestamp) >= start);
  }
  if (params.end) {
    const end = new Date(params.end + 'T23:59:59');
    rows = rows.filter(r => new Date(r.Timestamp) <= end);
  }
  if (params.nama) {
    rows = rows.filter(r => String(r.Nama).toLowerCase().includes(String(params.nama).toLowerCase()));
  }
  if (params.status) {
    rows = rows.filter(r => r.Jenis === params.status);
  }

  rows.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));

  return rows.map(r => ({
    timestamp: new Date(r.Timestamp).toISOString(),
    id: r.ID,
    nama: r.Nama,
    jenis: r.Jenis,
    durasiLabel: r.DurasiLabel,
    alasan: r.Alasan,
    lat: r.Latitude,
    lng: r.Longitude,
    ip: r.IP,
    status: r.Status
  }));
}

/* ------------------------------------------------------------------
 *  PENGATURAN & ADMIN
 * ------------------------------------------------------------------ */
function getPengaturanPublik_() {
  const s = getSettings_();
  return {
    jamMasuk: s.jamMasuk,
    jamPulang: s.jamPulang,
    durasiIzin: JSON.parse(s.durasiIzin || '[]'),
    jatahIzinBulanan: s.jatahIzinBulanan,
    pengumuman: s.pengumuman
  };
}

function adminLogin_(body) {
  if (isAdmin_(body.username, body.password)) return ok_({ login: true });
  return fail_('Username atau password salah.');
}
