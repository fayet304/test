// ============================================================
//  APLIKASI ABSENSI KARYAWAN - FRONTEND LOGIC
// ============================================================

/* ------------------------------------------------------------------
 *  API HELPER
 * ------------------------------------------------------------------ */
const Api = {
  async get(action, params = {}) {
    const qs = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(`${CONFIG.API_URL}?${qs}`);
    return res.json();
  },
  // Menggunakan Content-Type text/plain agar browser TIDAK mengirim
  // preflight OPTIONS request (Google Apps Script tidak menangani OPTIONS).
  async post(payload) {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return res.json();
  }
};

/* ------------------------------------------------------------------
 *  STATE GLOBAL
 * ------------------------------------------------------------------ */
const State = {
  karyawan: [],
  pengaturan: null,
  verifiedKaryawan: null, // { id, nama }
  jenisTerpilih: null,
  lokasi: null,
  clientIp: null,
  admin: null, // { username, password } jika sedang login
  durasiIzinDraft: [],
  izinInterval: null
};

/* ------------------------------------------------------------------
 *  NAVIGASI TAB
 * ------------------------------------------------------------------ */
function initNav() {
  const buttons = document.querySelectorAll('[data-tab]');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('nav-mobile').classList.toggle('hidden');
  });
}

function switchTab(tab) {
  document.querySelectorAll('.tab-section').forEach(sec => sec.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');

  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  document.getElementById('nav-mobile').classList.add('hidden');

  if (tab === 'dashboard') loadDashboard();
  if (tab === 'riwayat') loadRiwayat();
  if (tab === 'absensi') loadIzinRanking();
}

/* ------------------------------------------------------------------
 *  DASHBOARD
 * ------------------------------------------------------------------ */
async function loadDashboard() {
  try {
    const res = await Api.get('getDashboard');
    if (!res.success) return;
    const d = res.data;
    document.getElementById('stat-hadir').textContent = d.hadirHariIni;
    document.getElementById('stat-izin').textContent = d.izinAktif;
    document.getElementById('stat-total').textContent = d.totalKaryawan;
    showAnnouncement(d.pengumuman);
  } catch (err) {
    console.error('Gagal memuat dashboard', err);
  }

  try {
    const res = await Api.get('getRiwayat');
    if (!res.success) return;
    const recent = res.data.slice(0, 6);
    const container = document.getElementById('dashboard-recent');
    container.innerHTML = '';
    if (recent.length === 0) {
      container.innerHTML = '<p class="text-slate-400 py-4">Belum ada aktivitas.</p>';
      return;
    }
    recent.forEach(r => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between py-2.5';
      row.innerHTML = `
        <div>
          <p class="font-medium">${escapeHtml(r.nama)}</p>
          <p class="text-slate-400 text-xs">${formatDateTime(r.timestamp)}</p>
        </div>
        ${jenisBadge(r.jenis)}
      `;
      container.appendChild(row);
    });
  } catch (err) {
    console.error('Gagal memuat aktivitas terbaru', err);
  }
}

function showAnnouncement(text) {
  const bar = document.getElementById('announcement-bar');
  if (text && text.trim() !== '') {
    document.getElementById('announcement-text').textContent = text;
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

/* ------------------------------------------------------------------
 *  FORM ABSENSI / IZIN
 * ------------------------------------------------------------------ */
async function loadKaryawanDropdown() {
  try {
    const res = await Api.get('getKaryawan');
    if (!res.success) throw new Error(res.message);
    State.karyawan = res.data;
  } catch (err) {
    console.error('Gagal memuat daftar karyawan', err);
  }
}

async function loadPengaturanPublik() {
  try {
    const res = await Api.get('getPengaturanPublik');
    if (!res.success) return;
    State.pengaturan = res.data;
    showAnnouncement(res.data.pengumuman);
  } catch (err) {
    console.error('Gagal memuat pengaturan', err);
  }
}

function initFormAbsensi() {
  const namaSearch = document.getElementById('input-nama-search');
  const namaList = document.getElementById('nama-list');
  const namaSelected = document.getElementById('nama-selected');
  const pinWrapper = document.getElementById('pin-wrapper');
  const pinInput = document.getElementById('input-pin');
  const pinFeedback = document.getElementById('pin-feedback');
  const btnVerify = document.getElementById('btn-verify-pin');
  const jenisWrapper = document.getElementById('jenis-wrapper');
  const lokasiWrapper = document.getElementById('lokasi-wrapper');
  const lokasiStatus = document.getElementById('lokasi-status');
  const btnSubmit = document.getElementById('btn-submit-absen');
  const form = document.getElementById('form-absensi');
  const feedback = document.getElementById('form-feedback');

  let selectedId = '';

  namaSearch.addEventListener('input', () => {
    resetFormAfterNama();
    const q = namaSearch.value.trim().toLowerCase();
    if (q === '') { namaList.classList.add('hidden'); return; }
    const matches = State.karyawan.filter(k => k.nama.toLowerCase().includes(q)).slice(0, 8);
    namaList.innerHTML = '';
    if (matches.length === 0) {
      namaList.innerHTML = '<div class="p-2 text-slate-400 text-sm">Tidak ditemukan</div>';
    } else {
      matches.forEach(k => {
        const item = document.createElement('div');
        item.className = 'p-2.5 hover:bg-slate-100 cursor-pointer text-sm font-medium transition';
        item.textContent = k.nama;
        item.addEventListener('click', () => {
          selectedId = k.id;
          namaSearch.value = k.nama;
          namaList.classList.add('hidden');
          namaSelected.textContent = `Terpilih: ${k.nama}`;
          namaSelected.classList.remove('hidden');
          pinWrapper.classList.remove('hidden');
          pinInput.focus();
        });
        namaList.appendChild(item);
      });
    }
    namaList.classList.remove('hidden');
  });

  document.addEventListener('click', e => {
    if (!namaList.contains(e.target) && e.target !== namaSearch) namaList.classList.add('hidden');
  });

  btnVerify.addEventListener('click', async () => {
    const pin = pinInput.value.trim();
    if (!selectedId || !pin) return;
    btnVerify.disabled = true;
    btnVerify.textContent = '...';
    try {
      const res = await Api.post({ action: 'verifyPin', id: selectedId, pin });
      if (res.success && res.data.valid) {
        State.verifiedKaryawan = { id: selectedId, nama: res.data.nama };
        setPinFeedback(true, `PIN benar. Selamat datang, ${res.data.nama}.`);
        jenisWrapper.classList.remove('hidden');
        pinInput.disabled = true;
        btnVerify.classList.add('hidden');
        captureLocationAndIp();
        initIzinTimerFor(State.verifiedKaryawan, pin);
      } else {
        State.verifiedKaryawan = null;
        setPinFeedback(false, res.message || 'PIN salah.');
      }
    } catch (err) {
      setPinFeedback(false, 'Gagal menghubungi server. Coba lagi.');
    } finally {
      btnVerify.disabled = false;
      btnVerify.textContent = 'Verifikasi';
    }
  });

  document.querySelectorAll('.jenis-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.jenis-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.jenisTerpilih = btn.dataset.jenis;
      lokasiWrapper.classList.remove('hidden');
      updateSubmitState();
    });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!State.verifiedKaryawan || !State.jenisTerpilih) return;

    const payload = {
      action: 'absen',
      id: State.verifiedKaryawan.id,
      pin: pinInput.value.trim(),
      jenis: State.jenisTerpilih,
      lat: State.lokasi ? State.lokasi.lat : '',
      lng: State.lokasi ? State.lokasi.lng : '',
      ip: State.clientIp || ''
    };

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Mengirim...';
    try {
      const res = await Api.post(payload);
      if (res.success) {
        showFormFeedback(true, `Berhasil! ${res.data.jenis} tercatat untuk ${res.data.nama}.`);
        fireConfetti();
        setTimeout(resetSeluruhForm, 1800);
        loadDashboard();
      } else {
        showFormFeedback(false, res.message);
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Kirim Presensi';
      }
    } catch (err) {
      showFormFeedback(false, 'Gagal menghubungi server. Periksa koneksi internet Anda.');
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Kirim Presensi';
    }
  });

  function resetFormAfterNama() {
    selectedId = '';
    State.verifiedKaryawan = null;
    State.jenisTerpilih = null;
    pinInput.value = '';
    pinInput.disabled = false;
    btnVerify.classList.remove('hidden');
    pinFeedback.classList.add('hidden');
    pinWrapper.classList.add('hidden');
    jenisWrapper.classList.add('hidden');
    lokasiWrapper.classList.add('hidden');
    namaSelected.classList.add('hidden');
    document.querySelectorAll('.jenis-btn').forEach(b => b.classList.remove('active'));
    feedback.classList.add('hidden');
    resetIzinTimerUI();
    updateSubmitState();
  }

  function resetSeluruhForm() {
    form.reset();
    namaSearch.value = '';
    resetFormAfterNama();
    feedback.classList.add('hidden');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Kirim Presensi';
  }

  function updateSubmitState() {
    btnSubmit.disabled = !(State.verifiedKaryawan && State.jenisTerpilih);
  }

  function setPinFeedback(success, message) {
    pinFeedback.textContent = message;
    pinFeedback.className = `text-sm mt-2 rounded-lg px-3 py-2 ${success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`;
  }

  function showFormFeedback(success, message) {
    feedback.textContent = message;
    feedback.className = `text-sm rounded-lg px-4 py-3 ${success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`;
  }

  async function captureLocationAndIp() {
    lokasiStatus.textContent = 'Mengambil lokasi GPS...';
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          State.lokasi = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          lokasiStatus.textContent = `Lokasi didapat (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`;
        },
        () => {
          lokasiStatus.textContent = 'Lokasi tidak tersedia (izin ditolak). Absensi tetap bisa dikirim.';
        }
      );
    } else {
      lokasiStatus.textContent = 'GPS tidak didukung perangkat ini.';
    }

    try {
      const ipRes = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipRes.json();
      State.clientIp = ipData.ip;
    } catch (err) {
      State.clientIp = '';
    }
  }
}

/* ------------------------------------------------------------------
 *  TIMER IZIN KELUAR (Start / Stop)
 * ------------------------------------------------------------------ */
function resetIzinTimerUI() {
  clearInterval(State.izinInterval);
  document.getElementById('izin-timer-hint').classList.remove('hidden');
  document.getElementById('izin-timer-body').classList.add('hidden');
  document.getElementById('izin-timer-display').classList.add('hidden');
  document.getElementById('izin-feedback').classList.add('hidden');
}

async function initIzinTimerFor(karyawan, pin) {
  const hint = document.getElementById('izin-timer-hint');
  const bodyEl = document.getElementById('izin-timer-body');
  const keperluanSelect = document.getElementById('input-keperluan');
  const btnStart = document.getElementById('btn-izin-start');
  const btnStop = document.getElementById('btn-izin-stop');
  const display = document.getElementById('izin-timer-display');
  const clock = document.getElementById('izin-timer-clock');
  const keperluanLabel = document.getElementById('izin-timer-keperluan');
  const izinFeedback = document.getElementById('izin-feedback');

  hint.classList.add('hidden');
  bodyEl.classList.remove('hidden');

  keperluanSelect.innerHTML = '<option value="" disabled selected>Pilih keperluan</option>';
  (State.pengaturan?.durasiIzin || []).forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.label;
    opt.textContent = d.label;
    keperluanSelect.appendChild(opt);
  });

  function startClock(mulaiWaktu) {
    clearInterval(State.izinInterval);
    State.izinInterval = setInterval(() => {
      const diff = Math.floor((Date.now() - new Date(mulaiWaktu).getTime()) / 1000);
      const mm = String(Math.floor(diff / 60)).padStart(2, '0');
      const ss = String(diff % 60).padStart(2, '0');
      clock.textContent = `${mm}:${ss}`;
    }, 1000);
  }

  function setIzinFeedback(success, message) {
    izinFeedback.textContent = message;
    izinFeedback.className = `text-sm rounded-lg px-4 py-3 ${success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`;
  }

  try {
    const statusRes = await Api.get('getStatusIzin', { id: karyawan.id });
    if (statusRes.success && statusRes.data.aktif) {
      keperluanSelect.disabled = true;
      keperluanSelect.value = statusRes.data.keperluan;
      btnStart.disabled = true;
      btnStop.disabled = false;
      display.classList.remove('hidden');
      keperluanLabel.textContent = statusRes.data.keperluan;
      startClock(statusRes.data.mulaiWaktu);
    } else {
      btnStart.disabled = false;
      btnStop.disabled = true;
    }
  } catch (err) {
    console.error('Gagal mengambil status izin', err);
  }

  btnStart.onclick = async () => {
    const keperluan = keperluanSelect.value;
    if (!keperluan) {
      setIzinFeedback(false, 'Pilih keperluan terlebih dahulu.');
      return;
    }
    btnStart.disabled = true;
    try {
      const res = await Api.post({
        action: 'izinMulai',
        id: karyawan.id,
        pin,
        keperluan,
        lat: State.lokasi ? State.lokasi.lat : '',
        lng: State.lokasi ? State.lokasi.lng : '',
        ip: State.clientIp || ''
      });
      if (res.success) {
        keperluanSelect.disabled = true;
        btnStop.disabled = false;
        display.classList.remove('hidden');
        keperluanLabel.textContent = keperluan;
        startClock(res.data.mulaiWaktu);
        setIzinFeedback(true, 'Timer izin dimulai. Jangan lupa klik Stop saat kembali.');
        loadDashboard();
      } else {
        btnStart.disabled = false;
        setIzinFeedback(false, res.message);
      }
    } catch (err) {
      btnStart.disabled = false;
      setIzinFeedback(false, 'Gagal menghubungi server.');
    }
  };

  btnStop.onclick = async () => {
    btnStop.disabled = true;
    try {
      const res = await Api.post({
        action: 'izinSelesai',
        id: karyawan.id,
        pin,
        lat: State.lokasi ? State.lokasi.lat : '',
        lng: State.lokasi ? State.lokasi.lng : '',
        ip: State.clientIp || ''
      });
      if (res.success) {
        clearInterval(State.izinInterval);
        display.classList.add('hidden');
        keperluanSelect.disabled = false;
        keperluanSelect.value = '';
        btnStart.disabled = false;
        setIzinFeedback(true, `Selesai. Total izin keluar: ${res.data.durasiLabel}.`);
        loadDashboard();
        loadIzinRanking();
      } else {
        btnStop.disabled = false;
        setIzinFeedback(false, res.message);
      }
    } catch (err) {
      btnStop.disabled = false;
      setIzinFeedback(false, 'Gagal menghubungi server.');
    }
  };
}

/* ------------------------------------------------------------------
 *  RANKING IZIN BULAN INI
 * ------------------------------------------------------------------ */
async function loadIzinRanking() {
  const list = document.getElementById('izin-ranking-list');
  const empty = document.getElementById('izin-ranking-empty');
  const loading = document.getElementById('izin-ranking-loading');
  list.innerHTML = '';
  empty.classList.add('hidden');
  loading.classList.remove('hidden');
  try {
    const res = await Api.get('getIzinRanking');
    loading.classList.add('hidden');
    if (!res.success || res.data.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    res.data.forEach(r => {
      const row = document.createElement('div');
      row.className = 'flex justify-between items-center py-2 px-3 text-sm';
      row.innerHTML = `<span class="font-medium">${escapeHtml(r.nama)}</span><span class="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full text-xs">${r.count}x</span>`;
      list.appendChild(row);
    });
  } catch (err) {
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
  }
}

/* ------------------------------------------------------------------
 *  ACCORDION PANEL (buka/tutup panel-card)
 * ------------------------------------------------------------------ */
function initAccordions() {
  document.querySelectorAll('.panel-header').forEach(header => {
    header.addEventListener('click', () => {
      const target = document.getElementById(header.dataset.target);
      if (target) {
        target.classList.toggle('hidden');
        const chevron = header.querySelector('.chevron');
        if (chevron) chevron.classList.toggle('rotate-180');
      }
    });
  });
}

/* ------------------------------------------------------------------
 *  RIWAYAT
 * ------------------------------------------------------------------ */
function initRiwayat() {
  document.getElementById('btn-filter').addEventListener('click', loadRiwayat);
  document.getElementById('filter-search').addEventListener('keyup', e => {
    if (e.key === 'Enter') loadRiwayat();
  });
}

async function loadRiwayat() {
  const body = document.getElementById('riwayat-body');
  const loading = document.getElementById('riwayat-loading');
  const empty = document.getElementById('riwayat-empty');

  body.innerHTML = '';
  empty.classList.add('hidden');
  loading.classList.remove('hidden');

  const params = {
    nama: document.getElementById('filter-search').value.trim(),
    start: document.getElementById('filter-start').value,
    end: document.getElementById('filter-end').value,
    status: document.getElementById('filter-status').value
  };
  Object.keys(params).forEach(k => !params[k] && delete params[k]);

  try {
    const res = await Api.get('getRiwayat', params);
    loading.classList.add('hidden');
    if (!res.success) throw new Error(res.message);

    if (res.data.length === 0) {
      empty.classList.remove('hidden');
      return;
    }

    res.data.forEach(r => {
      const tr = document.createElement('tr');
      const detail = r.jenis === 'Izin Keluar' ? `${escapeHtml(r.durasiLabel || '')} &middot; ${escapeHtml(r.alasan || '')}` : '-';
      const lokasi = r.lat && r.lng
        ? `<a class="text-blue-600 hover:underline" target="_blank" rel="noopener" href="https://maps.google.com/?q=${r.lat},${r.lng}">Lihat peta</a>`
        : '-';
      tr.innerHTML = `
        <td class="px-4 py-3 whitespace-nowrap">${formatDateTime(r.timestamp)}</td>
        <td class="px-4 py-3">${escapeHtml(r.nama)}</td>
        <td class="px-4 py-3">${jenisBadge(r.jenis)}</td>
        <td class="px-4 py-3 text-slate-500">${detail}</td>
        <td class="px-4 py-3">${lokasi}</td>
      `;
      body.appendChild(tr);
    });
  } catch (err) {
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
    document.getElementById('riwayat-empty').textContent = 'Gagal memuat data riwayat.';
  }
}

/* ------------------------------------------------------------------
 *  ADMIN
 * ------------------------------------------------------------------ */
function initAdmin() {
  document.getElementById('form-admin-login').addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('admin-username').value.trim();
    const password = document.getElementById('admin-password').value;
    const feedback = document.getElementById('admin-login-feedback');
    try {
      const res = await Api.post({ action: 'adminLogin', username, password });
      if (res.success) {
        State.admin = { username, password };
        document.getElementById('admin-login-view').classList.add('hidden');
        document.getElementById('admin-panel-view').classList.remove('hidden');
        loadAdminData();
      } else {
        feedback.textContent = res.message;
        feedback.classList.remove('hidden');
      }
    } catch (err) {
      feedback.textContent = 'Gagal menghubungi server.';
      feedback.classList.remove('hidden');
    }
  });

  document.getElementById('btn-admin-logout').addEventListener('click', () => {
    State.admin = null;
    document.getElementById('admin-panel-view').classList.add('hidden');
    document.getElementById('admin-login-view').classList.remove('hidden');
    document.getElementById('form-admin-login').reset();
  });

  document.querySelectorAll('.sub-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.admin-sub-section').forEach(sec => sec.classList.add('hidden'));
      document.getElementById(`admin-sub-${btn.dataset.sub}`).classList.remove('hidden');
    });
  });

  document.getElementById('form-shift').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      action: 'adminUpdateShift',
      ...State.admin,
      jamMasuk: document.getElementById('shift-masuk').value,
      jamPulang: document.getElementById('shift-pulang').value
    };
    const res = await Api.post(payload);
    showSaveFeedback(e.target, res);
  });

  document.getElementById('btn-add-durasi').addEventListener('click', () => {
    State.durasiIzinDraft.push({ label: '', menit: 0 });
    renderDurasiList();
  });

  document.getElementById('form-izin').addEventListener('submit', async e => {
    e.preventDefault();
    const durasiIzin = State.durasiIzinDraft.filter(d => d.label.trim() !== '' && Number(d.menit) > 0);
    const payload = {
      action: 'adminUpdateIzin',
      ...State.admin,
      durasiIzin,
      jatahIzinBulanan: document.getElementById('izin-jatah').value
    };
    const res = await Api.post(payload);
    showSaveFeedback(e.target, res);
    if (res.success) loadPengaturanPublik();
  });

  document.getElementById('form-tambah-karyawan').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      action: 'adminAddKaryawan',
      ...State.admin,
      nama: document.getElementById('new-karyawan-nama').value.trim(),
      pin: document.getElementById('new-karyawan-pin').value.trim()
    };
    const res = await Api.post(payload);
    const feedback = document.getElementById('tambah-karyawan-feedback');
    feedback.textContent = res.success ? `Karyawan ditambahkan dengan ID ${res.data.id}.` : res.message;
    feedback.className = `save-feedback mt-3 ${res.success ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}`;
    if (res.success) {
      e.target.reset();
      loadKaryawanTable();
      loadKaryawanDropdown();
    }
  });

  document.getElementById('form-ip').addEventListener('submit', async e => {
    e.preventDefault();
    const ipWhitelist = document
      .getElementById('ip-list')
      .value.split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    const res = await Api.post({ action: 'adminUpdateIP', ...State.admin, ipWhitelist });
    showSaveFeedback(e.target, res);
  });

  document.getElementById('form-broadcast').addEventListener('submit', async e => {
    e.preventDefault();
    const pengumuman = document.getElementById('broadcast-text').value.trim();
    const res = await Api.post({ action: 'adminBroadcast', ...State.admin, pengumuman });
    showSaveFeedback(e.target, res);
    if (res.success) showAnnouncement(pengumuman);
  });
}

function showSaveFeedback(formEl, res) {
  const el = formEl.querySelector('.save-feedback');
  if (el) {
    el.textContent = res.success ? 'Perubahan berhasil disimpan.' : res.message;
    el.className = `save-feedback text-sm mt-2 font-semibold ${res.success ? 'text-green-600' : 'text-red-600'}`;
    el.classList.remove('hidden');
  }
}

async function loadAdminData() {
  try {
    const res = await Api.post({ action: 'adminGetSettings', ...State.admin });
    if (res.success) {
      const s = res.data;
      document.getElementById('shift-masuk').value = s.jamMasuk || '';
      document.getElementById('shift-pulang').value = s.jamPulang || '';
      document.getElementById('izin-jatah').value = s.jatahIzinBulanan || 0;
      State.durasiIzinDraft = JSON.parse(s.durasiIzin || '[]');
      renderDurasiList();
      const ipWhitelist = JSON.parse(s.ipWhitelist || '[]');
      document.getElementById('ip-list').value = ipWhitelist.join('\n');
      document.getElementById('broadcast-text').value = s.pengumuman || '';
    }
  } catch (err) {
    console.error('Gagal memuat pengaturan admin', err);
  }
  loadKaryawanTable();
}

function renderDurasiList() {
  const container = document.getElementById('durasi-list');
  container.innerHTML = '';
  State.durasiIzinDraft.forEach((d, i) => {
    const row = document.createElement('div');
    row.className = 'flex gap-2 items-center';
    row.innerHTML = `
      <input type="text" value="${escapeAttr(d.label)}" placeholder="Label (mis. 1 Jam)" class="form-input p-2 rounded-lg border w-full text-sm" />
      <input type="number" value="${d.menit}" placeholder="Menit" class="form-input p-2 rounded-lg border w-28 text-sm" />
      <button type="button" class="text-red-500 hover:text-red-700 px-2 font-bold text-lg">&times;</button>
    `;
    const inputs = row.querySelectorAll('input');
    inputs[0].addEventListener('input', e => (State.durasiIzinDraft[i].label = e.target.value));
    inputs[1].addEventListener('input', e => (State.durasiIzinDraft[i].menit = Number(e.target.value)));
    row.querySelector('button').addEventListener('click', () => {
      State.durasiIzinDraft.splice(i, 1);
      renderDurasiList();
    });
    container.appendChild(row);
  });
}

async function loadKaryawanTable() {
  const body = document.getElementById('karyawan-body');
  body.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-center text-slate-400">Memuat...</td></tr>';
  try {
    const res = await Api.post({ action: 'adminGetKaryawan', ...State.admin });
    if (!res.success) throw new Error(res.message);
    body.innerHTML = '';
    res.data.forEach(k => {
      const aktif = k.Aktif === true || k.Aktif === 'TRUE' || k.Aktif === 'true';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="px-4 py-3 text-slate-500">${escapeHtml(k.ID)}</td>
        <td class="px-4 py-3 font-medium">${escapeHtml(k.Nama)}</td>
        <td class="px-4 py-3"><span class="badge ${aktif ? 'badge-aktif' : 'badge-nonaktif'}">${aktif ? 'Aktif' : 'Nonaktif'}</span></td>
        <td class="px-4 py-3 text-right space-x-3 whitespace-nowrap">
          <button class="text-sm font-semibold text-blue-600 hover:underline btn-reset-pin">Reset PIN</button>
          <button class="text-sm font-semibold text-slate-500 hover:underline btn-toggle-aktif">${aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
        </td>
      `;
      tr.querySelector('.btn-reset-pin').addEventListener('click', () => resetPinKaryawan(k.ID, k.Nama));
      tr.querySelector('.btn-toggle-aktif').addEventListener('click', () => toggleAktifKaryawan(k.ID, !aktif));
      body.appendChild(tr);
    });
  } catch (err) {
    body.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-center text-red-500">Gagal memuat data karyawan.</td></tr>';
  }
}

async function resetPinKaryawan(id, nama) {
  const newPin = prompt(`Masukkan PIN baru untuk ${nama}:`);
  if (!newPin) return;
  const res = await Api.post({ action: 'adminResetPin', ...State.admin, id, newPin });
  alert(res.success ? 'PIN berhasil direset.' : res.message);
}

async function toggleAktifKaryawan(id, aktif) {
  const res = await Api.post({ action: 'adminEditKaryawan', ...State.admin, id, aktif });
  if (res.success) loadKaryawanTable();
  else alert(res.message);
}

/* ------------------------------------------------------------------
 *  UTILITAS
 * ------------------------------------------------------------------ */
function formatDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function jenisBadge(jenis) {
  const map = { Masuk: 'badge-masuk', Pulang: 'badge-pulang', 'Izin Mulai': 'badge-izin', 'Izin Selesai': 'badge-izin', 'Izin Keluar': 'badge-izin' };
  return `<span class="badge ${map[jenis] || 'badge-pulang'}">${escapeHtml(jenis)}</span>`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function escapeAttr(str) {
  return escapeHtml(str);
}

/* ------------------------------------------------------------------
 *  EFEK VISUAL: ANIMASI NAGA (CANVAS BACKGROUND)
 * ------------------------------------------------------------------ */
function initDragonCanvas() {
  const canvas = document.getElementById('dragon-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const dragon = {
    x: width / 2,
    y: height / 2,
    vx: 0,
    vy: 0,
    angle: 0,
    segments: [],
    numSegments: 25,
    segmentLength: 14
  };

  for (let i = 0; i < dragon.numSegments; i++) {
    dragon.segments.push({ x: dragon.x, y: dragon.y });
  }

  let targetX = Math.random() * width;
  let targetY = Math.random() * height;
  let changeTargetCounter = 0;

  function animate() {
    ctx.clearRect(0, 0, width, height);

    changeTargetCounter++;
    if (changeTargetCounter > 120 || Math.hypot(targetX - dragon.x, targetY - dragon.y) < 50) {
      targetX = Math.random() * (width - 100) + 50;
      targetY = Math.random() * (height - 100) + 50;
      changeTargetCounter = 0;
    }

    const dx = targetX - dragon.x;
    const dy = targetY - dragon.y;
    const targetAngle = Math.atan2(dy, dx);

    dragon.angle += (targetAngle - dragon.angle) * 0.03;
    dragon.vx = Math.cos(dragon.angle) * 2;
    dragon.vy = Math.sin(dragon.angle) * 2;

    dragon.x += dragon.vx;
    dragon.y += dragon.vy;

    dragon.segments[0] = { x: dragon.x, y: dragon.y };

    for (let i = 1; i < dragon.numSegments; i++) {
      const prev = dragon.segments[i - 1];
      const curr = dragon.segments[i];
      const segDx = prev.x - curr.x;
      const segDy = prev.y - curr.y;
      const segAngle = Math.atan2(segDy, segDx);

      curr.x = prev.x - Math.cos(segAngle) * dragon.segmentLength;
      curr.y = prev.y - Math.sin(segAngle) * dragon.segmentLength;
    }

    // Gambar naga
    for (let i = dragon.numSegments - 1; i >= 0; i--) {
      const seg = dragon.segments[i];
      const radius = i === 0 ? 12 : Math.max(3, 10 - i * 0.3);

      ctx.beginPath();
      ctx.arc(seg.x, seg.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#3a9ce8' : `rgba(113, 169, 241, ${1 - i / dragon.numSegments})`;
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }

  animate();
}

/* ------------------------------------------------------------------
 *  EFEK VISUAL: CONFETTI SAAT ABSEN BERHASIL
 * ------------------------------------------------------------------ */
function fireConfetti() {
  const colors = ['#0091ff', '#5fd4ff', '#0047d6', '#ffd23f', '#4dffc3'];
  const pieces = 40;
  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement('div');
    piece.className = 'fixed z-50 pointer-events-none rounded-sm';
    const size = 6 + Math.random() * 6;
    piece.style.width = `${size}px`;
    piece.style.height = `${size * 0.4}px`;
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.top = `-10px`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    
    const duration = 1.8 + Math.random() * 1.4;
    piece.style.transition = `transform ${duration}s linear, top ${duration}s linear, opacity ${duration}s linear`;
    document.body.appendChild(piece);

    setTimeout(() => {
      piece.style.top = `${100 + Math.random() * 20}vh`;
      piece.style.transform = `rotate(${Math.random() * 720}deg)`;
      piece.style.opacity = '0';
    }, 20);

    setTimeout(() => piece.remove(), duration * 1000 + 200);
  }
}

/* ------------------------------------------------------------------
 *  INISIALISASI APLIKASI
 * ------------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initAccordions();
  initFormAbsensi();
  initRiwayat();
  initAdmin();
  initDragonCanvas();
  
  loadKaryawanDropdown();
  loadPengaturanPublik();
  loadDashboard();
});
