// ==================== VERSION ====================
const APP_VERSION = '1.0.0';

// ==================== DATA LAYER ====================
function getProfiles() {
  return JSON.parse(localStorage.getItem('im_profiles') || '[]');
}
function saveProfiles(profiles) {
  localStorage.setItem('im_profiles', JSON.stringify(profiles));
}
function getCurrentUser() {
  const id = localStorage.getItem('im_currentUser');
  if (!id) return null;
  return getProfiles().find(p => p.id === id) || null;
}
function updateUser(updatedUser) {
  const profiles = getProfiles();
  const idx = profiles.findIndex(p => p.id === updatedUser.id);
  if (idx !== -1) { profiles[idx] = updatedUser; saveProfiles(profiles); }
}

// ==================== AUTH ====================
function showSignup() {
  document.getElementById('auth-login').classList.add('hidden');
  document.getElementById('auth-signup').classList.remove('hidden');
  hideAuthError();
}
function showLogin() {
  document.getElementById('auth-signup').classList.add('hidden');
  document.getElementById('auth-login').classList.remove('hidden');
  hideAuthError();
}
function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg; el.classList.remove('hidden');
}
function hideAuthError() {
  document.getElementById('auth-error').classList.add('hidden');
}

function signup() {
  const name = document.getElementById('signup-name').value.trim();
  const pin = document.getElementById('signup-pin').value.trim();
  const isAdmin = document.getElementById('signup-admin').checked;
  if (!name) { showAuthError('Please enter a name.'); return; }
  const profiles = getProfiles();
  if (profiles.find(p => p.name.toLowerCase() === name.toLowerCase())) {
    showAuthError('A profile with that name already exists.'); return;
  }
  const user = {
    id: crypto.randomUUID(),
    name, pin, isAdmin, theme: 'pink',
    minutesBank: 0,
    practiceLog: [],
    usageLog: []
  };
  profiles.push(user);
  saveProfiles(profiles);
  localStorage.setItem('im_currentUser', user.id);
  enterApp();
}

function login() {
  const name = document.getElementById('login-name').value.trim();
  const pin = document.getElementById('login-pin').value.trim();
  if (!name) { showAuthError('Please enter your name.'); return; }
  const profiles = getProfiles();
  const user = profiles.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (!user) { showAuthError('Profile not found.'); return; }
  if (user.pin && user.pin !== pin) { showAuthError('Incorrect PIN.'); return; }
  localStorage.setItem('im_currentUser', user.id);
  enterApp();
}

function logout() {
  cancelTimer();
  localStorage.removeItem('im_currentUser');
  showScreen('screen-auth');
  document.getElementById('login-name').value = '';
  document.getElementById('login-pin').value = '';
  showLogin();
}

// ==================== SCREENS & TABS ====================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'screen-admin') renderAdmin();
  if (id === 'screen-app') refreshApp();
}

function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');
  document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (tabId === 'tab-stats') renderStats();
  if (tabId === 'tab-practice') renderPracticeHistory();
}

// ==================== APP ENTRY ====================
function enterApp() {
  hideAuthError();
  const user = getCurrentUser();
  if (user && user.isAdmin) {
    showScreen('screen-admin');
  } else {
    showScreen('screen-app');
    requestNotificationPermission();
  }
  refreshApp();
}

function refreshApp() {
  const user = getCurrentUser();
  if (!user) { showScreen('screen-auth'); return; }
  document.getElementById('display-name').textContent = user.name;
  document.getElementById('display-role').textContent = user.isAdmin ? 'Admin' : 'User';
  document.getElementById('btn-admin-dash').style.display = user.isAdmin ? '' : 'none';
  document.getElementById('balance-minutes').textContent = user.minutesBank;
  document.getElementById('timer-max-note').textContent =
    user.minutesBank > 0 ? `Max: ${user.minutesBank} minutes` : 'No minutes available — log some practice first!';
  document.getElementById('timer-input').max = user.minutesBank;
  const mode = getMode(user);
  applyTheme(user.theme || 'pink', mode);
  updateModeButtons(mode);
  renderThemePicker(user.theme || 'pink');
  renderPracticeHistory();
}

// ==================== PRACTICE LOGGING ====================
function logPractice() {
  const hours = parseInt(document.getElementById('practice-hours').value) || 0;
  const mins = parseInt(document.getElementById('practice-mins').value) || 0;
  const total = hours * 60 + mins;
  if (total <= 0) return;
  const user = getCurrentUser();
  user.minutesBank += total;
  user.practiceLog.push({ date: new Date().toISOString(), minutes: total });
  updateUser(user);
  document.getElementById('practice-hours').value = 0;
  document.getElementById('practice-mins').value = 0;
  refreshApp();
}

function renderPracticeHistory() {
  const user = getCurrentUser();
  if (!user) return;
  const el = document.getElementById('practice-history');
  if (user.practiceLog.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">No practice logged yet.</p>';
    return;
  }
  el.innerHTML = user.practiceLog.slice().reverse().map(e => {
    const d = new Date(e.date);
    const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const h = Math.floor(e.minutes / 60);
    const m = e.minutes % 60;
    const dur = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return `<div class="history-item"><span>${dateStr}</span><span style="font-weight:600;color:var(--accent-dark);">+${dur}</span></div>`;
  }).join('');
}

// ==================== TIMER ====================
let timerInterval = null;
let timerRemaining = 0; // seconds
let timerPaused = false;
let timerTotalMinutes = 0;
let overtimeInterval = null;
let overtimeSeconds = 0;
let audioCtx = null;

function startTimer() {
  const user = getCurrentUser();
  const input = parseInt(document.getElementById('timer-input').value);
  if (!input || input <= 0) return;
  if (input > user.minutesBank) {
    alert(`You only have ${user.minutesBank} minutes available.`);
    return;
  }
  timerTotalMinutes = input;
  timerRemaining = input * 60;
  timerPaused = false;
  document.getElementById('timer-setup').classList.add('hidden');
  document.getElementById('timer-running').classList.remove('hidden');
  document.getElementById('timer-finished').classList.add('hidden');
  document.getElementById('btn-pause').textContent = 'Pause';
  updateTimerDisplay();
  timerInterval = setInterval(timerTick, 1000);
}

function timerTick() {
  if (timerPaused) return;
  timerRemaining--;
  updateTimerDisplay();
  if (timerRemaining <= 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    timerFinished();
  }
}

function updateTimerDisplay() {
  const m = Math.floor(timerRemaining / 60);
  const s = timerRemaining % 60;
  document.getElementById('timer-countdown').textContent =
    String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function togglePause() {
  timerPaused = !timerPaused;
  document.getElementById('btn-pause').textContent = timerPaused ? 'Resume' : 'Pause';
}

function cancelTimer() {
  clearInterval(timerInterval); timerInterval = null;
  clearInterval(overtimeInterval); overtimeInterval = null;
  timerRemaining = 0; timerPaused = false;
  document.getElementById('timer-setup').classList.remove('hidden');
  document.getElementById('timer-running').classList.add('hidden');
  document.getElementById('timer-finished').classList.add('hidden');
}

function timerFinished() {
  // Deduct minutes
  const user = getCurrentUser();
  user.minutesBank = Math.max(0, user.minutesBank - timerTotalMinutes);
  const today = new Date().toISOString().slice(0, 10);
  user.usageLog.push({ date: today, minutesUsed: timerTotalMinutes, overtime: false });
  updateUser(user);

  // Play alarm
  playAlarm();

  // Send notification
  sendNotification('Instrument Minutes', 'Your screen timer is up!');

  // Show message
  const msgEl = document.getElementById('timer-end-message');
  if (user.minutesBank <= 0) {
    msgEl.textContent = "You don't have any more minutes left.";
    msgEl.className = 'message message-danger';
    // Start overtime tracking
    startOvertimeTracking();
  } else {
    msgEl.textContent = 'Add more minutes or take a screen break! Your timer is up.';
    msgEl.className = 'message message-warning';
  }

  document.getElementById('timer-running').classList.add('hidden');
  document.getElementById('timer-finished').classList.remove('hidden');



  refreshApp();
}

function dismissTimer() {
  stopAlarm();
  const user = getCurrentUser();
  if (user && user.minutesBank > 0) {
    // User has minutes left — stop overtime tracking
    clearInterval(overtimeInterval); overtimeInterval = null;
    hideUserOvertimeBanner();
  } else if (user && user.minutesBank <= 0 && !overtimeInterval) {
    // User has no minutes and overtime isn't already running — start it now
    startOvertimeTracking();
  }
  document.getElementById('timer-finished').classList.add('hidden');
  document.getElementById('timer-setup').classList.remove('hidden');
  document.getElementById('timer-input').value = '';
  refreshApp();
}

function educationalBypass() {
  stopAlarm();
  clearInterval(overtimeInterval); overtimeInterval = null;
  document.getElementById('timer-finished').classList.add('hidden');
  document.getElementById('timer-setup').classList.remove('hidden');
  document.getElementById('timer-input').value = '';
  // No restriction — user continues for educational purposes
  refreshApp();
}

// ==================== OVERTIME TRACKING ====================
const OVERTIME_THRESHOLD = 60; // seconds (set to 60 for testing, change to 600 for production)

function startOvertimeTracking() {
  overtimeSeconds = 0;
  clearInterval(overtimeInterval);
  overtimeInterval = setInterval(() => {
    overtimeSeconds++;
    if (overtimeSeconds >= OVERTIME_THRESHOLD) {
      clearInterval(overtimeInterval);
      overtimeInterval = null;
      flagOvertime();
    }
  }, 1000);
}

function flagOvertime() {
  const user = getCurrentUser();
  // Mark the last usage entry as overtime
  if (user.usageLog.length > 0) {
    user.usageLog[user.usageLog.length - 1].overtime = true;
  }
  updateUser(user);

  // Notify the user
  sendNotification('Instrument Minutes', 'You have gone over your screen time limit!');

  // Show overtime banner on user's page
  showUserOvertimeBanner();
}

function showUserOvertimeBanner() {
  let banner = document.getElementById('user-overtime-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'user-overtime-banner';
    banner.className = 'overtime-banner';
    banner.style.cursor = 'pointer';
    banner.onclick = function() { banner.classList.add('hidden'); };
    // Insert at top of the app screen, after the profile header
    const appScreen = document.getElementById('screen-app');
    const nav = appScreen.querySelector('.nav');
    appScreen.insertBefore(banner, nav);
  }
  banner.textContent = 'You have exceeded your screen time! You stayed on for more than ' +
    Math.round(OVERTIME_THRESHOLD / 60) + ' minute(s) past your timer with no minutes left.';
  banner.classList.remove('hidden');
}

function hideUserOvertimeBanner() {
  const banner = document.getElementById('user-overtime-banner');
  if (banner) banner.classList.add('hidden');
}

// ==================== AUDIO ====================
let alarmOscillator = null;
let alarmGain = null;

function playAlarm() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    alarmGain = audioCtx.createGain();
    alarmGain.connect(audioCtx.destination);
    alarmGain.gain.value = 0.3;

    function beep(time) {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 880;
      osc.connect(alarmGain);
      osc.start(time);
      osc.stop(time + 0.15);
    }

    const now = audioCtx.currentTime;
    for (let i = 0; i < 20; i++) {
      beep(now + i * 0.4);
    }
  } catch (e) {}
}

function stopAlarm() {
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
}

// ==================== NOTIFICATIONS ====================
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '' });
  }
}

// ==================== STATS ====================
function renderStats() {
  const user = getCurrentUser();
  if (!user) return;

  // Get current week (Mon-Sun)
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7; // Mon=0
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek);
  monday.setHours(0, 0, 0, 0);

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekData = days.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const total = user.usageLog
      .filter(e => e.date === dateStr)
      .reduce((sum, e) => sum + e.minutesUsed, 0);
    return { label, minutes: total };
  });

  const maxMin = Math.max(1, ...weekData.map(d => d.minutes));
  const chartEl = document.getElementById('usage-chart');
  chartEl.innerHTML = weekData.map(d => {
    const h = Math.max(2, (d.minutes / maxMin) * 120);
    return `<div class="chart-bar-wrap">
      <div class="chart-value">${d.minutes}</div>
      <div class="chart-bar" style="height:${h}px"></div>
      <div class="chart-label">${d.label}</div>
    </div>`;
  }).join('');

  // Usage history
  const histEl = document.getElementById('usage-history');
  if (user.usageLog.length === 0) {
    histEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">No usage yet.</p>';
    return;
  }
  histEl.innerHTML = user.usageLog.slice().reverse().map(e => {
    const overtimeTag = e.overtime ? ' <span style="color:#e65100;font-weight:700;">OVERTIME</span>' : '';
    return `<div class="history-item"><span>${e.date}</span><span style="font-weight:600;">${e.minutesUsed}m${overtimeTag}</span></div>`;
  }).join('');
}

// ==================== THEMES ====================
const THEMES_DARK = {
  pink:   { bg: '#1a1a2e', bg2: '#222244', accent: '#f2a7c3', accentLight: '#2e2848', accentDark: '#f0c0d4' },
  red:    { bg: '#1e1a1a', bg2: '#2e2222', accent: '#f28a8a', accentLight: '#3a2828', accentDark: '#f0b0b0' },
  orange: { bg: '#1e1c1a', bg2: '#2e2822', accent: '#f2b880', accentLight: '#3a3028', accentDark: '#f0d0a0' },
  yellow: { bg: '#1e1e1a', bg2: '#2e2e22', accent: '#f2d680', accentLight: '#3a3828', accentDark: '#f0e0a0' },
  green:  { bg: '#1a1e1a', bg2: '#222e22', accent: '#81c784', accentLight: '#283a28', accentDark: '#a0e0a4' },
  blue:   { bg: '#1a1a1e', bg2: '#22222e', accent: '#80b8f2', accentLight: '#28283a', accentDark: '#a0d0f0' },
  purple: { bg: '#1c1a1e', bg2: '#28222e', accent: '#b080f2', accentLight: '#30283a', accentDark: '#d0a0f0' },
};

const THEMES_LIGHT = {
  pink:   { bg: '#fef6fb', bg2: '#fff', accent: '#f2a7c3', accentLight: '#fce4ef', accentDark: '#d4809e' },
  red:    { bg: '#fef2f2', bg2: '#fff', accent: '#f28a8a', accentLight: '#fde8e8', accentDark: '#c96262' },
  orange: { bg: '#fef7f0', bg2: '#fff', accent: '#f2b880', accentLight: '#fdecd8', accentDark: '#c9925a' },
  yellow: { bg: '#fefcf0', bg2: '#fff', accent: '#f2d680', accentLight: '#fdf4d8', accentDark: '#b8a040' },
  green:  { bg: '#f2fef6', bg2: '#fff', accent: '#81c784', accentLight: '#ddf5de', accentDark: '#5a9e5d' },
  blue:   { bg: '#f0f6fe', bg2: '#fff', accent: '#80b8f2', accentLight: '#d8ecfd', accentDark: '#5a8ec9' },
  purple: { bg: '#f6f0fe', bg2: '#fff', accent: '#b080f2', accentLight: '#e8d8fd', accentDark: '#8a5ac9' },
};

function getMode(user) {
  return (user && user.mode) || 'dark';
}

function applyTheme(name, mode) {
  const themes = mode === 'light' ? THEMES_LIGHT : THEMES_DARK;
  const t = themes[name] || themes.pink;
  document.documentElement.style.setProperty('--bg', t.bg);
  document.documentElement.style.setProperty('--bg2', t.bg2);
  document.documentElement.style.setProperty('--accent', t.accent);
  document.documentElement.style.setProperty('--accent-light', t.accentLight);
  document.documentElement.style.setProperty('--accent-dark', t.accentDark);

  // Update text and border colours for light/dark
  if (mode === 'light') {
    document.documentElement.style.setProperty('--text', '#3a3a3a');
    document.documentElement.style.setProperty('--text-muted', '#888');
    document.documentElement.style.setProperty('--border', '#eee');
    document.documentElement.style.setProperty('--shadow', '0 2px 16px rgba(0,0,0,0.06)');
    document.documentElement.style.setProperty('--yellow-banner', '#fff3cd');
  } else {
    document.documentElement.style.setProperty('--text', '#e8e8f0');
    document.documentElement.style.setProperty('--text-muted', '#9999aa');
    document.documentElement.style.setProperty('--border', '#333355');
    document.documentElement.style.setProperty('--shadow', '0 2px 16px rgba(0,0,0,0.3)');
    document.documentElement.style.setProperty('--yellow-banner', '#3d3520');
  }
}

function renderThemePicker(current) {
  const el = document.getElementById('theme-picker');
  el.innerHTML = Object.entries(THEMES_DARK).map(([name, t]) =>
    `<div class="theme-dot ${name === current ? 'active' : ''}"
          style="background:${t.accent}"
          onclick="setTheme('${name}')"
          title="${name}"></div>`
  ).join('');
}

function setTheme(name) {
  const user = getCurrentUser();
  user.theme = name;
  updateUser(user);
  applyTheme(name, getMode(user));
  renderThemePicker(name);
  // Also update admin theme picker if visible
  const adminPicker = document.getElementById('admin-theme-picker');
  if (adminPicker) {
    adminPicker.innerHTML = Object.entries(THEMES_DARK).map(([n, t]) =>
      `<div class="theme-dot ${n === name ? 'active' : ''}"
            style="background:${t.accent}"
            onclick="setTheme('${n}')"
            title="${n}"></div>`
    ).join('');
  }
}

function setMode(mode) {
  const user = getCurrentUser();
  user.mode = mode;
  updateUser(user);
  applyTheme(user.theme || 'pink', mode);
  updateModeButtons(mode);
}

function updateModeButtons(mode) {
  // Update both user and admin mode buttons
  const pairs = [
    ['btn-dark-mode', 'btn-light-mode'],
    ['admin-btn-dark-mode', 'admin-btn-light-mode']
  ];
  pairs.forEach(([darkId, lightId]) => {
    const darkBtn = document.getElementById(darkId);
    const lightBtn = document.getElementById(lightId);
    if (!darkBtn || !lightBtn) return;
    if (mode === 'dark') {
      darkBtn.className = 'btn btn-sm';
      lightBtn.className = 'btn btn-sm btn-outline';
    } else {
      darkBtn.className = 'btn btn-sm btn-outline';
      lightBtn.className = 'btn btn-sm';
    }
  });
}

function adminSettings() {
  const panel = document.getElementById('admin-settings-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    // Render admin theme picker
    const user = getCurrentUser();
    const el = document.getElementById('admin-theme-picker');
    const current = user.theme || 'pink';
    el.innerHTML = Object.entries(THEMES_DARK).map(([name, t]) =>
      `<div class="theme-dot ${name === current ? 'active' : ''}"
            style="background:${t.accent}"
            onclick="setTheme('${name}')"
            title="${name}"></div>`
    ).join('');
  }
}

// ==================== ADMIN DASHBOARD ====================
function renderAdmin() {
  const profiles = getProfiles().filter(p => !p.isAdmin);
  const bannerEl = document.getElementById('admin-overtime-banners');
  const bodyEl = document.getElementById('admin-users-body');
  const weeklyEl = document.getElementById('admin-weekly');

  // Overtime banners
  const overtimeUsers = profiles.filter(p => p.usageLog.some(e => e.overtime));
  bannerEl.innerHTML = overtimeUsers.map(u => {
    const count = u.usageLog.filter(e => e.overtime).length;
    return `<div class="overtime-banner">${u.name} has ${count} overtime violation${count > 1 ? 's' : ''} (stayed 10+ min past timer with no minutes left)</div>`;
  }).join('');

  // Table
  bodyEl.innerHTML = profiles.map(u => {
    const totalEarned = u.practiceLog.reduce((s, e) => s + e.minutes, 0);
    const totalUsed = u.usageLog.reduce((s, e) => s + e.minutesUsed, 0);
    const overtimeCount = u.usageLog.filter(e => e.overtime).length;
    return `<tr>
      <td>${u.name}</td>
      <td>${totalEarned}m</td>
      <td>${totalUsed}m</td>
      <td>${u.minutesBank}m</td>
      <td>${overtimeCount > 0 ? `<span style="color:#e65100;font-weight:700;">${overtimeCount}</span>` : '0'}</td>
    </tr>`;
  }).join('');

  if (profiles.length === 0) {
    bodyEl.innerHTML = '<tr><td colspan="5" style="color:var(--text-muted);">No users yet.</td></tr>';
  }

  // Weekly per user
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek);
  monday.setHours(0, 0, 0, 0);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  weeklyEl.innerHTML = profiles.map(u => {
    const weekData = days.map((label, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const total = u.usageLog
        .filter(e => e.date === dateStr)
        .reduce((sum, e) => sum + e.minutesUsed, 0);
      return { label, minutes: total };
    });
    const maxMin = Math.max(1, ...weekData.map(d => d.minutes));
    return `<div class="card">
      <h3>${u.name}</h3>
      <div class="chart">${weekData.map(d => {
        const h = Math.max(2, (d.minutes / maxMin) * 100);
        return `<div class="chart-bar-wrap">
          <div class="chart-value">${d.minutes}</div>
          <div class="chart-bar" style="height:${h}px"></div>
          <div class="chart-label">${d.label}</div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }).join('');

  if (profiles.length === 0) {
    weeklyEl.innerHTML = '<p style="color:var(--text-muted);">No users to show.</p>';
  }
}

// ==================== DELETE PROFILE ====================
function deleteProfile() {
  const user = getCurrentUser();
  if (!user) return;
  if (!confirm(`Are you sure you want to delete the profile "${user.name}"? This cannot be undone.`)) return;
  const profiles = getProfiles().filter(p => p.id !== user.id);
  saveProfiles(profiles);
  localStorage.removeItem('im_currentUser');
  cancelTimer();
  showScreen('screen-auth');
  showLogin();
}

// ==================== INIT ====================
(function init() {
  document.getElementById('version-badge').textContent = 'v' + APP_VERSION;
  const user = getCurrentUser();
  if (user) {
    enterApp();
  }
})();
