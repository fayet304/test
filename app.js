/* ============================================================
   JL GROUP — Employee Management System
   app.js: State management, timer logic, localStorage, API calls
   ============================================================ */

// ------------------------------------------------------------------
// KONSTANTA & STATE
// ------------------------------------------------------------------
const LS_KEYS = {
  SESSION: 'jlg_session',
  KARYAWAN: 'jlg_karyawan_cache',
  SETTINGS: 'jlg_settings_cache',
  IZIN_ACTIVE: 'jlg_izin_active',
  GAS_URL: 'jlg_gas_url'
};

const MENU_LABELS = {
  dashboard: 'Dashboard',
  absensi: 'Absensi',
  karyawan: 'Data Karyawan',
  izin: 'Aktivitas Izin',
  riwayat: 'Riwayat',
  pengaturan: 'Pengaturan'
};

// Urutan prioritas URL backend:
// 1. Override tersimpan di localStorage browser ini (diatur lewat menu Pengaturan)
// 2. Default global dari config.js (JLG_CONFIG.GAS_URL) — berlaku untuk semua orang
const DEFAULT_GAS_URL = (typeof JLG_CONFIG !== 'undefined' && JLG_CONFIG.GAS_URL) ? JLG_CONFIG.GAS_URL : '';

let STATE = {
  gasUrl: localStorage.getItem(LS_KEYS.GAS_URL) || DEFAULT_GAS_URL,
  session: null,             // karyawan yang login
  karyawanList: [],
  settings: {},
  pendingLoginEmployee: null,
  pendingIzinJenis: null,
  izinTimerInterval: null,
  izinActive: null,          // {id, jenis, mulaiTimestamp}
  stopIzinDraft: null        // {durasiMenit} sementara sebelum konfirmasi
};

// ------------------------------------------------------------------
// UTIL: TOAST
// ------------------------------------------------------------------
function showToast(message, type) {
  const container = document.getElementById('jlg-toast-container');
  const colors = {
    success: 'border-l-4 border-teal-400',
    error: 'border-l-4 border-red-400',
    info: 'border-l-4 border-amber-300'
  };
  const el = document.createElement('div');
  el.className = 'jlg-toast glass-strong rounded-xl px-4 py-3 text-xs ' + (colors[type] || colors.info);
  el.textContent = message;
  container.appendChild(el);
  setTimeout(function () {
    el.style.opacity = '0';
    el.style.transition = 'opacity .2s ease';
    setTimeout(function () { el.remove(); }, 200);
  }, 3200);
}

// ------------------------------------------------------------------
// UTIL: MODAL
// ------------------------------------------------------------------
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ------------------------------------------------------------------
// UTIL: API (fetch ke Google Apps Script)
// ------------------------------------------------------------------
// PENTING: POST dikirim dengan Content-Type: text/plain agar browser TIDAK
// melakukan CORS preflight (OPTIONS) — Apps Script Web App tidak menangani
// preflight dengan baik. Body tetap string JSON dan diparse manual di server.
async function apiGet(action, params) {
  if (!STATE.gasUrl) {
    showToast('URL Google Apps Script belum diatur di Pengaturan.', 'error');
    return { success: false, message: 'GAS URL kosong' };
  }
  const qs = new URLSearchParams(Object.assign({ action: action }, params || {})).toString();
  try {
    const res = await fetch(STATE.gasUrl + '?' + qs, { method: 'GET' });
    return await res.json();
  } catch (err) {
    showToast('Gagal terhubung ke server: ' + err.message, 'error');
    return { success: false, message: err.message };
  }
}

async function apiPost(action, data) {
  if (!STATE.gasUrl) {
    showToast('URL Google Apps Script belum diatur di Pengaturan.', 'error');
    return { success: false, message: 'GAS URL kosong' };
  }
  try {
    const res = await fetch(STATE.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, data || {}))
    });
    return await res.json();
  } catch (err) {
    showToast('Gagal terhubung ke server: ' + err.message, 'error');
    return { success: false, message: err.message };
  }
}

// ------------------------------------------------------------------
// INIT
// ------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', init);

async function init() {
  document.getElementById('setting-gas-url').value = STATE.gasUrl;

  // Restore sesi login dari localStorage (state persistence)
  const savedSession = localStorage.getItem(LS_KEYS.SESSION);
  const savedKaryawan = localStorage.getItem(LS_KEYS.KARYAWAN);
  const savedSettings = localStorage.getItem(LS_KEYS.SETTINGS);
  if (savedKaryawan) STATE.karyawanList = JSON.parse(savedKaryawan);
  if (savedSettings) STATE.settings = JSON.parse(savedSettings);

  // Restore timer izin (anti-reset, berbasis timestamp asli)
  const savedIzin = localStorage.getItem(LS_KEYS.IZIN_ACTIVE);
  if (savedIzin) {
    STATE.izinActive = JSON.parse(savedIzin);
  }

  if (savedSession) {
    STATE.session = JSON.parse(savedSession);
    showAppShell();
    resumeIzinTimerIfAny();
    applySettingsToUI();
  } else {
    await checkIpAndRenderLogin();
  }

  // Refresh cache data karyawan & settings di background jika GAS URL ada
  if (STATE.gasUrl) {
    refreshKaryawanCache();
    refreshSettingsCache();
  }
}

// ------------------------------------------------------------------
// PAGE 1: LOGIN & IP WHITELIST CHECK
// ------------------------------------------------------------------
async function checkIpAndRenderLogin() {
  await renderEmployeeGrid();

  let myIp = null;
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    myIp = data.ip;
  } catch (e) {
    myIp = null; // jika gagal, lanjutkan tanpa blokir keras (fail-open utk demo/lokal)
  }

  const whitelistRaw = STATE.settings.IPWhitelist;
  let whitelist = [];
  try { whitelist = JSON.parse(whitelistRaw || '[]'); } catch (e) { whitelist = []; }

  if (whitelist.length > 0 && myIp && whitelist.indexOf(myIp) === -1) {
    document.getElementById('detected-ip').textContent = myIp;
    openModal('modal-ip-blocked');
    document.getElementById('employee-grid').style.pointerEvents = 'none';
    document.getElementById('employee-grid').style.opacity = '0.4';
  }
}

async function renderEmployeeGrid() {
  if (STATE.karyawanList.length === 0) {
    const res = await apiGet('getKaryawan');
    if (res.success) {
      STATE.karyawanList = res.data;
      localStorage.setItem(LS_KEYS.KARYAWAN, JSON.stringify(res.data));
    }
  }
  const grid = document.getElementById('employee-grid');
  const aktif = STATE.karyawanList.filter(function (k) { return String(k.Status).toLowerCase() !== 'nonaktif'; });

  if (aktif.length === 0) {
    grid.innerHTML = '<div class="col-span-full text-center py-8" style="color:var(--jlg-text-dim)">Belum ada data karyawan. Atur URL Google Apps Script di halaman Pengaturan setelah login pertama kali.</div>';
    return;
  }

  grid.innerHTML = aktif.map(function (k) {
    return '<div class="employee-card glass rounded-2xl p-4 text-center" onclick="openPinLogin(\'' + k.Nama.replace(/'/g, "\\'") + '\')">' +
      '<img class="employee-photo mx-auto mb-2" src="' + (k.FotoURL || fallbackAvatar(k.Nama)) + '" onerror="this.src=\'' + fallbackAvatar(k.Nama) + '\'" />' +
      '<div class="text-xs font-semibold truncate">' + k.Nama + '</div>' +
      '<div class="text-[10px] truncate" style="color:var(--jlg-text-dim)">' + k.Divisi + '</div>' +
      '</div>';
  }).join('');
}

function fallbackAvatar(name) {
  return 'https://ui-avatars.com/api/?background=2dd4bf&color=06231f&name=' + encodeURIComponent(name);
}

function openPinLogin(nama) {
  const k = STATE.karyawanList.find(function (x) { return x.Nama === nama; });
  if (!k) return;
  STATE.pendingLoginEmployee = k;
  document.getElementById('pin-login-photo').src = k.FotoURL || fallbackAvatar(k.Nama);
  document.getElementById('pin-login-name').textContent = k.Nama;
  document.getElementById('pin-input').value = '';
  document.getElementById('pin-error').classList.add('hidden');
  updatePinDots('');
  openModal('modal-pin-login');
  setTimeout(function () { document.getElementById('pin-input').focus(); }, 100);
}

function onPinInput() {
  const val = document.getElementById('pin-input').value;
  updatePinDots(val);
}

function updatePinDots(val) {
  const dots = document.querySelectorAll('#pin-dots .pin-dot');
  dots.forEach(function (d, i) { d.classList.toggle('filled', i < val.length); });
}

async function submitPinLogin() {
  const pin = document.getElementById('pin-input').value;
  if (!pin) return;
  const res = await apiPost('login', { pin: pin });
  if (!res.success) {
    document.getElementById('pin-error').textContent = res.message || 'PIN salah, coba lagi.';
    document.getElementById('pin-error').classList.remove('hidden');
    return;
  }
  STATE.session = res.data;
  localStorage.setItem(LS_KEYS.SESSION, JSON.stringify(res.data));
  closeModal('modal-pin-login');
  showAppShell();
  showToast('Berhasil login sebagai ' + res.data.Nama, 'success');
  refreshKaryawanCache();
  refreshSettingsCache();
}

function logout() {
  localStorage.removeItem(LS_KEYS.SESSION);
  STATE.session = null;
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('page-login').classList.remove('hidden');
  checkIpAndRenderLogin();
}

// ------------------------------------------------------------------
// APP SHELL
// ------------------------------------------------------------------
function showAppShell() {
  document.getElementById('page-login').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

  const s = STATE.session;
  document.getElementById('sidebar-user-photo').src = s.FotoURL || fallbackAvatar(s.Nama);
  document.getElementById('sidebar-user-name').textContent = s.Nama;
  document.getElementById('sidebar-user-divisi').textContent = s.Divisi;

  applyMenuAccess();
  navigateTo('dashboard');
  loadDashboard();
  loadAbsensiStatus();
  loadKaryawanTable();
  loadRiwayatTable();
  populateHakAksesDropdown();
}

function applyMenuAccess() {
  const s = STATE.session;
  let allowed = MENU_LABELS && Object.keys(MENU_LABELS);
  if (s.HakAksesMenu) allowed = String(s.HakAksesMenu).split(',').map(function (x) { return x.trim(); });
  document.querySelectorAll('#sidebar-nav .nav-item').forEach(function (item) {
    const menu = item.getAttribute('data-menu');
    item.style.display = allowed.indexOf(menu) !== -1 ? '' : 'none';
  });
}

function navigateTo(menu) {
  document.querySelectorAll('.page-section').forEach(function (s) { s.classList.remove('active'); });
  document.getElementById('section-' + menu).classList.add('active');
  document.querySelectorAll('#sidebar-nav .nav-item').forEach(function (item) {
    item.classList.toggle('active', item.getAttribute('data-menu') === menu);
  });
  if (menu === 'dashboard') loadDashboard();
  if (menu === 'karyawan') loadKaryawanTable();
  if (menu === 'riwayat') loadRiwayatTable();
  if (menu === 'pengaturan') applySettingsToUI();
}

function applySettingsToUI() {
  const s = STATE.settings || {};
  document.getElementById('setting-broadcast').value = s.BroadcastInfo || '';
  document.getElementById('setting-limit-izin').value = s.LimitDurasiIzin || '';
  try {
    const wl = JSON.parse(s.IPWhitelist || '[]');
    document.getElementById('setting-ip-whitelist').value = wl.join('\n');
  } catch (e) { document.getElementById('setting-ip-whitelist').value = ''; }
  try {
    const jk = JSON.parse(s.JamKerja || '{}');
    document.getElementById('setting-jam-mulai').value = jk.mulai || '';
    document.getElementById('setting-jam-selesai').value = jk.selesai || '';
  } catch (e) {}

  if (s.BroadcastInfo) {
    document.getElementById('broadcast-bar').classList.remove('hidden');
    document.getElementById('broadcast-text').textContent = s.BroadcastInfo;
  }
}

// ------------------------------------------------------------------
// DASHBOARD
// ------------------------------------------------------------------
async function loadDashboard() {
  const res = await apiGet('getDashboard');
  if (!res.success) return;
  document.getElementById('stat-total').textContent = res.data.totalKaryawan;
  document.getElementById('stat-hadir').textContent = res.data.totalHadir;
  document.getElementById('stat-izin').textContent = res.data.totalIzin;
  document.getElementById('stat-off').textContent = res.data.totalOff;

  const riwayatRes = await apiGet('getRiwayat');
  if (riwayatRes.success) {
    const recent = riwayatRes.data.slice(-6).reverse();
    document.getElementById('dashboard-recent').innerHTML = recent.length
      ? recent.map(function (r) {
          return '<div class="flex justify-between glass rounded-lg px-3 py-2"><span>' + r.Nama + ' — ' + r.Jenis + '</span><span style="color:var(--jlg-text-dim)">' + r.Detail + '</span></div>';
        }).join('')
      : '<div style="color:var(--jlg-text-dim)">Belum ada aktivitas.</div>';
  }
}

// ------------------------------------------------------------------
// ABSENSI
// ------------------------------------------------------------------
async function loadAbsensiStatus() {
  const res = await apiGet('getAbsensi', { tanggal: todayStr() });
  const el = document.getElementById('absen-status-today');
  if (!res.success) { el.textContent = 'Gagal memuat status.'; return; }
  const mine = res.data.find(function (r) { return r.Nama === STATE.session.Nama; });
  if (!mine) { el.textContent = 'Anda belum absen hadir hari ini.'; return; }
  el.innerHTML = 'Hadir: <b>' + mine.JamMasuk + '</b>' + (mine.JamPulang ? ' &nbsp;•&nbsp; Pulang: <b>' + mine.JamPulang + '</b>' : ' &nbsp;•&nbsp; Belum absen pulang');
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function doAbsen(jenis) {
  const res = jenis === 'masuk'
    ? await apiPost('absenMasuk', { nama: STATE.session.Nama })
    : await apiPost('absenPulang', { nama: STATE.session.Nama });

  if (!res.success) { showToast(res.message, 'error'); return; }

  const emoji = document.getElementById('absen-modal-emoji');
  const title = document.getElementById('absen-modal-title');
  const desc = document.getElementById('absen-modal-desc');
  if (jenis === 'masuk') {
    emoji.textContent = '👋';
    title.textContent = 'Selamat Datang!';
    desc.textContent = 'Absen hadir tercatat pukul ' + res.jam + '.';
  } else {
    emoji.textContent = '🌇';
    title.textContent = 'Selamat Pulang!';
    desc.textContent = 'Jangan lupa datang kembali besok ya. Tercatat pukul ' + res.jam + '.';
  }
  openModal('modal-absen');
  loadAbsensiStatus();
  loadDashboard();
}

// ------------------------------------------------------------------
// DATA KARYAWAN
// ------------------------------------------------------------------
async function refreshKaryawanCache() {
  const res = await apiGet('getKaryawan');
  if (res.success) {
    STATE.karyawanList = res.data;
    localStorage.setItem(LS_KEYS.KARYAWAN, JSON.stringify(res.data));
    loadKaryawanTable();
    populateHakAksesDropdown();
  }
}

function loadKaryawanTable() {
  const tbody = document.getElementById('karyawan-table-body');
  if (!tbody) return;
  tbody.innerHTML = STATE.karyawanList.map(function (k) {
    const badge = String(k.Status).toLowerCase() === 'nonaktif' ? 'badge-red' : 'badge-green';
    return '<tr onclick=\'openDetailKaryawan(' + JSON.stringify(k.ID) + ')\'>' +
      '<td><img class="employee-photo !w-8 !h-8" src="' + (k.FotoURL || fallbackAvatar(k.Nama)) + '" onerror="this.src=\'' + fallbackAvatar(k.Nama) + '\'" /></td>' +
      '<td>' + k.Nama + '</td><td>' + k.Divisi + '</td>' +
      '<td><span class="badge ' + badge + '">' + k.Status + '</span></td></tr>';
  }).join('');
}

async function submitTambahKaryawan() {
  const nama = document.getElementById('new-nama').value.trim();
  const divisi = document.getElementById('new-divisi').value.trim();
  const foto = document.getElementById('new-foto').value.trim();
  const pin = document.getElementById('new-pin').value.trim();
  if (!nama || !divisi || !pin) { showToast('Nama, Divisi, dan PIN wajib diisi.', 'error'); return; }

  const res = await apiPost('addKaryawan', { data: { Nama: nama, Divisi: divisi, FotoURL: foto, PIN: pin } });
  if (res.success) {
    showToast('Karyawan berhasil ditambahkan.', 'success');
    closeModal('modal-tambah-karyawan');
    ['new-nama', 'new-divisi', 'new-foto', 'new-pin'].forEach(function (id) { document.getElementById(id).value = ''; });
    refreshKaryawanCache();
  } else {
    showToast(res.message, 'error');
  }
}

let currentDetailId = null;
function openDetailKaryawan(id) {
  const k = STATE.karyawanList.find(function (x) { return String(x.ID) === String(id); });
  if (!k) return;
  currentDetailId = k.ID;
  document.getElementById('detail-photo').src = k.FotoURL || fallbackAvatar(k.Nama);
  document.getElementById('detail-nama').textContent = k.Nama;
  document.getElementById('detail-divisi').textContent = k.Divisi;
  document.getElementById('edit-nama').value = k.Nama;
  document.getElementById('edit-divisi').value = k.Divisi;
  document.getElementById('edit-foto').value = k.FotoURL || '';
  document.getElementById('edit-status').value = String(k.Status || 'aktif').toLowerCase();
  toggleEditKaryawan(false);
  openModal('modal-detail-karyawan');
}

function toggleEditKaryawan(edit) {
  document.getElementById('detail-view-mode').classList.toggle('hidden', edit);
  document.getElementById('detail-edit-mode').classList.toggle('hidden', !edit);
}

async function submitEditKaryawan() {
  const data = {
    ID: currentDetailId,
    Nama: document.getElementById('edit-nama').value.trim(),
    Divisi: document.getElementById('edit-divisi').value.trim(),
    FotoURL: document.getElementById('edit-foto').value.trim(),
    Status: document.getElementById('edit-status').value
  };
  const res = await apiPost('editKaryawan', { data: data });
  if (res.success) {
    showToast('Data karyawan diperbarui.', 'success');
    closeModal('modal-detail-karyawan');
    refreshKaryawanCache();
  } else {
    showToast(res.message, 'error');
  }
}

// ------------------------------------------------------------------
// AKTIVITAS IZIN — timer anti-reset berbasis Date.now()
// ------------------------------------------------------------------
function openIzinModal(jenis) {
  if (STATE.izinActive) { showToast('Anda masih memiliki izin yang sedang berjalan.', 'error'); return; }
  STATE.pendingIzinJenis = jenis;
  document.getElementById('mulai-izin-jenis').textContent = jenis;
  openModal('modal-mulai-izin');
}

async function confirmMulaiIzin() {
  const jenis = STATE.pendingIzinJenis;
  const startIso = new Date().toISOString();
  const res = await apiPost('izinMulai', { nama: STATE.session.Nama, jenis: jenis, waktuMulai: startIso });
  if (!res.success) { showToast(res.message, 'error'); closeModal('modal-mulai-izin'); return; }

  STATE.izinActive = { id: res.id, jenis: jenis, mulaiTimestamp: Date.now() };
  localStorage.setItem(LS_KEYS.IZIN_ACTIVE, JSON.stringify(STATE.izinActive));
  closeModal('modal-mulai-izin');
  startIzinTimerUI();
  showToast('Izin ' + jenis + ' dimulai.', 'success');
}

function resumeIzinTimerIfAny() {
  if (STATE.izinActive) startIzinTimerUI();
}

function startIzinTimerUI() {
  document.getElementById('izin-idle-view').classList.add('hidden');
  document.getElementById('izin-running-view').classList.remove('hidden');
  document.getElementById('izin-running-jenis').textContent = STATE.izinActive.jenis;

  if (STATE.izinTimerInterval) clearInterval(STATE.izinTimerInterval);
  tickIzinTimer();
  STATE.izinTimerInterval = setInterval(tickIzinTimer, 1000);
}

function tickIzinTimer() {
  if (!STATE.izinActive) return;
  // Selisih dihitung dari timestamp asli (Date.now() saat mulai), bukan
  // dari counter lokal — sehingga refresh halaman tidak me-reset durasi.
  const elapsedMs = Date.now() - STATE.izinActive.mulaiTimestamp;
  const totalSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  document.getElementById('izin-timer').textContent = mm + ':' + ss;

  const limit = Number(STATE.settings.LimitDurasiIzin || 0);
  const timerEl = document.getElementById('izin-timer');
  if (limit && totalSec > limit * 60) {
    timerEl.style.color = 'var(--jlg-danger)';
  }
}

function openStopIzinModal() {
  const elapsedMs = Date.now() - STATE.izinActive.mulaiTimestamp;
  const totalMin = Math.max(1, Math.round(elapsedMs / 60000));
  STATE.stopIzinDraft = { durasiMenit: totalMin };
  document.getElementById('stop-izin-durasi').textContent = totalMin + ' menit';
  openModal('modal-stop-izin');
}

async function confirmStopIzin() {
  const active = STATE.izinActive;
  const endIso = new Date().toISOString();
  const res = await apiPost('izinSelesai', {
    id: active.id,
    waktuSelesai: endIso,
    durasiMenit: STATE.stopIzinDraft.durasiMenit
  });

  clearInterval(STATE.izinTimerInterval);
  STATE.izinTimerInterval = null;
  STATE.izinActive = null;
  localStorage.removeItem(LS_KEYS.IZIN_ACTIVE);

  document.getElementById('izin-running-view').classList.add('hidden');
  document.getElementById('izin-idle-view').classList.remove('hidden');
  closeModal('modal-stop-izin');

  if (res.success) {
    showToast('Aktivitas izin selesai dicatat.', 'success');
    loadRiwayatTable();
    loadDashboard();
  } else {
    showToast(res.message, 'error');
  }
}

// ------------------------------------------------------------------
// RIWAYAT
// ------------------------------------------------------------------
async function loadRiwayatTable() {
  const tbody = document.getElementById('riwayat-table-body');
  if (!tbody) return;
  const res = await apiGet('getRiwayat');
  if (!res.success) return;
  const rows = res.data.slice().reverse();
  tbody.innerHTML = rows.length
    ? rows.map(function (r) {
        return '<tr><td>' + r.Nama + '</td><td>' + r.Jenis + '</td><td>' + r.Detail + '</td><td>' + r.Tanggal + '</td></tr>';
      }).join('')
    : '<tr><td colspan="4" style="color:var(--jlg-text-dim)">Belum ada riwayat.</td></tr>';
}

// ------------------------------------------------------------------
// PENGATURAN
// ------------------------------------------------------------------
async function refreshSettingsCache() {
  const res = await apiGet('getSettings');
  if (res.success) {
    STATE.settings = res.data;
    localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(res.data));
    applySettingsToUI();
  }
}

function saveGasUrl() {
  const url = document.getElementById('setting-gas-url').value.trim();
  STATE.gasUrl = url;
  localStorage.setItem(LS_KEYS.GAS_URL, url);
  showToast('Override URL backend disimpan di browser ini.', 'success');
  refreshKaryawanCache();
  refreshSettingsCache();
}

function clearGasUrlOverride() {
  localStorage.removeItem(LS_KEYS.GAS_URL);
  STATE.gasUrl = DEFAULT_GAS_URL;
  document.getElementById('setting-gas-url').value = DEFAULT_GAS_URL;
  showToast('Kembali memakai URL default dari config.js.', 'success');
  refreshKaryawanCache();
  refreshSettingsCache();
}

async function saveJamKerja() {
  const mulai = document.getElementById('setting-jam-mulai').value;
  const selesai = document.getElementById('setting-jam-selesai').value;
  const res = await apiPost('updateSettings', { data: { JamKerja: JSON.stringify({ mulai: mulai, selesai: selesai }) } });
  if (res.success) { showToast('Jam kerja disimpan.', 'success'); refreshSettingsCache(); }
}

async function saveBroadcast() {
  const val = document.getElementById('setting-broadcast').value;
  const res = await apiPost('updateSettings', { data: { BroadcastInfo: val } });
  if (res.success) { showToast('Broadcast info disimpan.', 'success'); refreshSettingsCache(); }
}

async function saveLimitIzin() {
  const val = document.getElementById('setting-limit-izin').value;
  const res = await apiPost('updateSettings', { data: { LimitDurasiIzin: val } });
  if (res.success) { showToast('Batas durasi izin disimpan.', 'success'); refreshSettingsCache(); }
}

async function saveIpWhitelist() {
  const raw = document.getElementById('setting-ip-whitelist').value;
  const list = raw.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  const res = await apiPost('updateSettings', { data: { IPWhitelist: JSON.stringify(list) } });
  if (res.success) { showToast('IP whitelist disimpan.', 'success'); refreshSettingsCache(); }
}

function populateHakAksesDropdown() {
  const sel = document.getElementById('setting-hakakses-karyawan');
  if (!sel) return;
  sel.innerHTML = STATE.karyawanList.map(function (k) {
    return '<option value="' + k.ID + '">' + k.Nama + '</option>';
  }).join('');
  if (STATE.karyawanList.length) loadHakAksesFor(STATE.karyawanList[0].ID);
}

function loadHakAksesFor(id) {
  const k = STATE.karyawanList.find(function (x) { return String(x.ID) === String(id); });
  const box = document.getElementById('setting-hakakses-checkboxes');
  if (!k || !box) return;
  const current = (k.HakAksesMenu || Object.keys(MENU_LABELS).join(',')).split(',').map(function (s) { return s.trim(); });
  box.innerHTML = Object.keys(MENU_LABELS).map(function (menu) {
    const checked = current.indexOf(menu) !== -1 ? 'checked' : '';
    return '<label class="flex items-center gap-1.5"><input type="checkbox" value="' + menu + '" ' + checked + ' /> ' + MENU_LABELS[menu] + '</label>';
  }).join('');
  box.dataset.karyawanId = id;
}

async function saveHakAkses() {
  const box = document.getElementById('setting-hakakses-checkboxes');
  const id = box.dataset.karyawanId;
  const checked = Array.from(box.querySelectorAll('input[type=checkbox]:checked')).map(function (c) { return c.value; });
  const res = await apiPost('editKaryawan', { data: { ID: id, HakAksesMenu: checked.join(',') } });
  if (res.success) {
    showToast('Hak akses menu disimpan.', 'success');
    refreshKaryawanCache();
  } else {
    showToast(res.message, 'error');
  }
}
