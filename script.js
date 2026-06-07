// ==================== VERSION ====================
const APP_VERSION = '1.15.6';

// ==================== CHANGELOG ====================
const CHANGELOG = [
  { version: '1.15.6', notes: 'Calendar streak circles slightly larger for better visibility.' },
  { version: '1.15.5', notes: 'Calendar uses small colored circles around day numbers — orange for practiced, blue for freeze.' },
  { version: '1.15.0', notes: "What's New popup — see what changed after each update." },
  { version: '1.14.0', notes: 'Calendar shows flame icons on practiced days. Blue flames for streak freeze days.' },
  { version: '1.13.0', notes: 'Streak lost popup — revive your streak for 30 minutes instead of losing it.' },
  { version: '1.12.0', notes: 'Shop tab — buy streak freezes to protect your streak when you miss a day.' },
  { version: '1.11.0', notes: 'Milestone rewards made much more generous.' },
  { version: '1.10.0', notes: 'Secret terminal panel (Cmd+Shift+\\) for power-user commands.' },
  { version: '1.9.0', notes: 'Timer redesigned — tap Start, timer counts up, tap Finish to use minutes.' },
];

// ==================== CONFIG ====================
const GIST_ID = 'ab0f0b0a12593cccc0efd7db998410e4';
const _t = ['Z2hwX0NnTVJZ', 'YzdsMDRjM0g4', 'VWV6cVlBUDBU', 'S0VUSnlPdjFT', 'RUQ3Vw=='];
const GITHUB_TOKEN = atob(_t.join(''));

// ==================== DATA LAYER (GitHub Gist) ====================
let db = { profiles: [] }; // in-memory cache
let gistLoadedOk = false; // true only after successful Gist fetch

async function loadDB() {
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
    });
    if (!res.ok) throw new Error('Failed to load data');
    const gist = await res.json();
    // Try primary, fall back to backup
    let parsed = null;
    const primary = gist.files['data.json'];
    if (primary) {
      parsed = JSON.parse(primary.content);
    }
    if (!parsed || !parsed.profiles || parsed.profiles.length === 0) {
      const backup = gist.files['data-backup.json'];
      if (backup) {
        const backupParsed = JSON.parse(backup.content);
        if (backupParsed && backupParsed.profiles && backupParsed.profiles.length > 0) {
          console.warn('Primary data empty, restored from backup');
          parsed = backupParsed;
        }
      }
    }
    db = parsed && parsed.profiles ? parsed : { profiles: [] };
    gistLoadedOk = true;
    // Update localStorage cache with known-good Gist data
    localStorage.setItem('im_db_cache', JSON.stringify(db));
  } catch (e) {
    console.error('loadDB error:', e);
    gistLoadedOk = false;
    const cached = localStorage.getItem('im_db_cache');
    if (cached) db = JSON.parse(cached);
  }
}

async function saveDB() {
  if (!gistLoadedOk) {
    console.warn('saveDB blocked — Gist was not loaded successfully');
    showToast('Save blocked — no connection', true);
    return false;
  }
  try {
    const data = JSON.stringify(db, null, 2);
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: { 'data.json': { content: data } }
      })
    });
    if (!res.ok) throw new Error('Save failed');
    // Only cache locally after successful Gist save
    localStorage.setItem('im_db_cache', JSON.stringify(db));
    return true;
  } catch (e) {
    console.error('saveDB error:', e);
    return false;
  }
}

function showToast(message, isError) {
  let toast = document.getElementById('save-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'save-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'save-toast ' + (isError ? 'save-toast-error' : 'save-toast-ok');
  toast.offsetHeight; // force reflow
  toast.classList.add('save-toast-show');
  setTimeout(() => toast.classList.remove('save-toast-show'), 2000);
}

function saveBackup() {
  if (db.profiles.length === 0) return;
  fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      files: { 'data-backup.json': { content: JSON.stringify(db, null, 2) } }
    })
  }).catch(() => {});
}

function getProfiles() {
  return db.profiles || [];
}

function getCurrentUser() {
  const id = localStorage.getItem('im_currentUser');
  if (!id) return null;
  return getProfiles().find(p => p.id === id) || null;
}

async function updateUser(updatedUser) {
  const idx = db.profiles.findIndex(p => p.id === updatedUser.id);
  if (idx !== -1) {
    db.profiles[idx] = updatedUser;
    const ok = await saveDB();
    if (!ok) showToast('Save failed! Check connection.', true);
    return ok;
  }
  return false;
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

async function signup() {
  const name = document.getElementById('signup-name').value.trim();
  const pin = document.getElementById('signup-pin').value.trim();
  const isAdmin = document.getElementById('signup-admin').checked;
  if (!name) { showAuthError('Please enter a name.'); return; }
  // Reload DB to get latest profiles from other devices
  await loadDB();
  if (db.profiles.find(p => p.name.toLowerCase() === name.toLowerCase())) {
    showAuthError('A profile with that name already exists.'); return;
  }
  const user = {
    id: crypto.randomUUID(),
    name, pin, isAdmin, theme: 'pink',
    minutesBank: 0,
    practiceLog: [],
    usageLog: [],
    streak: 0,
    lastPracticeDate: null,
    claimedMilestones: [],
    streakFreezes: 0,
    purchaseLog: []
  };
  db.profiles.push(user);
  await saveDB();
  localStorage.setItem('im_currentUser', user.id);
  enterApp();
}

async function login() {
  const name = document.getElementById('login-name').value.trim();
  const pin = document.getElementById('login-pin').value.trim();
  if (!name) { showAuthError('Please enter your name.'); return; }
  // Reload DB to get latest profiles from other devices
  await loadDB();
  const user = db.profiles.find(p => p.name.toLowerCase() === name.toLowerCase());
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
  if (id === 'screen-streak') {
    calendarViewDate = new Date();
    refreshStreakDisplay();
    renderStreakCalendar();
    renderMilestones();
  }
}

function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');
  document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (tabId === 'tab-stats') renderStats();
  if (tabId === 'tab-practice') renderPracticeHistory();
  if (tabId === 'tab-shop') renderShop();
}

// ==================== APP ENTRY ====================
async function enterApp() {
  hideAuthError();
  const user = getCurrentUser();
  if (user && !user.isAdmin) {
    await checkStreakReset(user);
  }
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
  // Disable start button if no minutes available
  const startBtn = document.querySelector('#timer-setup .btn');
  if (startBtn) {
    startBtn.disabled = user.minutesBank <= 0;
    startBtn.textContent = user.minutesBank > 0 ? 'Start Using Minutes' : 'No minutes available';
  }
  const mode = getMode(user);
  applyTheme(user.theme || 'pink', mode);
  updateModeButtons(mode);
  renderThemePicker(user.theme || 'pink');
  renderPracticeHistory();
  refreshStreakDisplay();
}

// ==================== PRACTICE LOGGING ====================
async function logPractice() {
  const hours = parseInt(document.getElementById('practice-hours').value) || 0;
  const mins = parseInt(document.getElementById('practice-mins').value) || 0;
  const total = hours * 60 + mins;
  if (total <= 0) return;
  const user = getCurrentUser();
  user.minutesBank += total;
  user.practiceLog.push({ date: new Date().toISOString(), minutes: total });
  updateStreak(user);
  await updateUser(user);
  saveBackup();
  showToast('Practice saved!');
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
  const reversed = user.practiceLog.slice().reverse();
  el.innerHTML = reversed.map((e, ri) => {
    const idx = user.practiceLog.length - 1 - ri; // original index
    const d = new Date(e.date);
    const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const h = Math.floor(e.minutes / 60);
    const m = e.minutes % 60;
    const dur = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return `<div class="history-item"><span>${dateStr}</span><span style="display:flex;align-items:center;gap:8px;"><span style="font-weight:600;color:var(--accent-dark);">+${dur}</span><button class="btn btn-sm btn-danger" onclick="deletePractice(${idx})" style="padding:2px 8px;font-size:0.75rem;">✕</button></span></div>`;
  }).join('');
}

async function deletePractice(idx) {
  const user = getCurrentUser();
  if (!user || idx < 0 || idx >= user.practiceLog.length) return;
  const entry = user.practiceLog[idx];
  if (!confirm(`Remove ${entry.minutes} minutes of practice from ${new Date(entry.date).toLocaleDateString()}?`)) return;
  user.practiceLog.splice(idx, 1);
  user.minutesBank = Math.max(0, user.minutesBank - entry.minutes);
  await updateUser(user);
  refreshApp();
}

// ==================== STREAK ====================
const MILESTONES = [
  { days: 10, reward: 7 },
  { days: 20, reward: 15 },
  { days: 30, reward: 25 },
  { days: 50, reward: 35 },
  { days: 75, reward: 50 },
  { days: 100, reward: 70 },
  { days: 150, reward: 100 },
  { days: 200, reward: 130 },
  { days: 300, reward: 175 },
  { days: 365, reward: 250 },
];

let calendarViewDate = new Date(); // tracks which month is displayed

function getTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getYesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function updateStreak(user) {
  const today = getTodayStr();
  if (!user.lastPracticeDate) {
    user.streak = 1;
    user.lastPracticeDate = today;
  } else if (user.lastPracticeDate === today) {
    // Already practiced today — no change
  } else if (user.lastPracticeDate === getYesterdayStr()) {
    user.streak = (user.streak || 0) + 1;
    user.lastPracticeDate = today;
  } else {
    // Missed day(s) — reset
    user.streak = 1;
    user.lastPracticeDate = today;
  }
  // Ensure claimedMilestones exists
  if (!user.claimedMilestones) user.claimedMilestones = [];
}

const STREAK_REVIVE_COST = 30;

async function checkStreakReset(user) {
  if (!user.lastPracticeDate) return;
  const today = getTodayStr();
  const yesterday = getYesterdayStr();

  const lastDate = new Date(user.lastPracticeDate + 'T00:00:00');
  const todayDate = new Date(today + 'T00:00:00');
  const daysSincePractice = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

  // 0 = today, 1 = yesterday — streak safe
  if (daysSincePractice <= 1) {
    if (!user.claimedMilestones) user.claimedMilestones = [];
    return;
  }

  // 2+ days — missed at least one full day
  if (user.streak !== 0) {
    const missedDays = daysSincePractice - 1;
    const freezesAvailable = user.streakFreezes || 0;

    if (freezesAvailable >= missedDays && missedDays > 0) {
      // Auto-use freezes to cover gap
      const origFreezes = freezesAvailable;
      const origLastPractice = user.lastPracticeDate;
      user.streakFreezes = freezesAvailable - missedDays;
      user.lastPracticeDate = yesterday;
      if (!user.purchaseLog) user.purchaseLog = [];
      if (!user.freezeDates) user.freezeDates = [];
      // Log each frozen day
      for (let i = 1; i <= missedDays; i++) {
        const frozenDate = new Date(lastDate);
        frozenDate.setDate(frozenDate.getDate() + i);
        const ds = frozenDate.getFullYear() + '-' + String(frozenDate.getMonth() + 1).padStart(2, '0') + '-' + String(frozenDate.getDate()).padStart(2, '0');
        if (!user.freezeDates.includes(ds)) user.freezeDates.push(ds);
      }
      const ok = await updateUser(user);
      if (!ok) {
        user.streakFreezes = origFreezes;
        user.lastPracticeDate = origLastPractice;
      }
    } else {
      // Not enough freezes — show revive popup instead of resetting immediately
      showStreakLostPopup(user);
    }
  }
  if (!user.claimedMilestones) user.claimedMilestones = [];
}

function showStreakLostPopup(user) {
  const lostStreak = user.streak;
  const canRevive = user.minutesBank >= STREAK_REVIVE_COST;
  const popup = document.getElementById('streak-lost-popup');
  document.getElementById('streak-lost-count').textContent = lostStreak;
  const reviveBtn = document.getElementById('btn-streak-revive');
  reviveBtn.disabled = !canRevive;
  reviveBtn.textContent = canRevive ? `Revive for ${STREAK_REVIVE_COST} min` : 'Not enough minutes';
  popup.classList.remove('hidden');
}

async function reviveStreak() {
  const user = getCurrentUser();
  if (!user || user.minutesBank < STREAK_REVIVE_COST) return;
  const origMinutes = user.minutesBank;
  const origLastPractice = user.lastPracticeDate;
  user.minutesBank -= STREAK_REVIVE_COST;
  user.lastPracticeDate = getYesterdayStr();
  if (!user.purchaseLog) user.purchaseLog = [];
  user.purchaseLog.push({ date: getTodayStr(), item: 'Streak Revive', cost: STREAK_REVIVE_COST });
  const ok = await updateUser(user);
  if (!ok) {
    user.minutesBank = origMinutes;
    user.lastPracticeDate = origLastPractice;
    user.purchaseLog.pop();
  } else {
    showToast('Streak revived!');
    saveBackup();
  }
  document.getElementById('streak-lost-popup').classList.add('hidden');
  refreshApp();
}

async function declineRevive() {
  const user = getCurrentUser();
  if (!user) return;
  const origStreak = user.streak;
  user.streak = 0;
  const ok = await updateUser(user);
  if (!ok) {
    user.streak = origStreak;
  }
  document.getElementById('streak-lost-popup').classList.add('hidden');
  refreshApp();
}

function refreshStreakDisplay() {
  const user = getCurrentUser();
  if (!user) return;
  const streak = user.streak || 0;
  const practicedToday = user.lastPracticeDate === getTodayStr();

  document.getElementById('streak-count').textContent = streak;
  const bigCount = document.getElementById('streak-big-count');
  if (bigCount) bigCount.textContent = streak;

  // Update badge background
  const badge = document.getElementById('streak-badge');
  if (badge) {
    badge.style.background = practicedToday
      ? 'linear-gradient(135deg, #ff6b35, #ff4500)'
      : 'linear-gradient(135deg, #666, #555)';
    badge.style.boxShadow = practicedToday
      ? '0 2px 8px rgba(255, 69, 0, 0.3)'
      : '0 2px 8px rgba(0, 0, 0, 0.2)';
  }

  // Update flame SVGs (both small and big)
  ['streak-flame', 'streak-flame-big'].forEach(id => {
    const svg = document.getElementById(id);
    if (!svg) return;
    const paths = svg.querySelectorAll('path');
    const ellipse = svg.querySelector('ellipse');
    // path 0 = outer flame (with bump), path 1 = inner flame
    if (paths[0]) {
      paths[0].setAttribute('fill', practicedToday ? '#F4900C' : '#888');
      paths[0].setAttribute('stroke', practicedToday ? '#fff' : '#aaa');
    }
    if (paths[1]) {
      paths[1].setAttribute('fill', practicedToday ? '#FFCC4D' : '#aaa');
    }
  });

  // Update big number color
  if (bigCount) {
    bigCount.style.color = practicedToday ? '#ff6b35' : 'var(--text-muted)';
  }
}

function switchStreakTab(tabId, btn) {
  document.querySelectorAll('.streak-tab-content').forEach(t => t.classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');
  const nav = btn.parentElement;
  nav.querySelectorAll('button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// Calendar
function renderStreakCalendar() {
  const user = getCurrentUser();
  if (!user) return;

  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  const label = calendarViewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  document.getElementById('calendar-month-label').textContent = label;

  // Get practiced dates for this month
  const practicedDates = new Set();
  (user.practiceLog || []).forEach(e => {
    const d = new Date(e.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      practicedDates.add(d.getDate());
    }
  });

  // Get freeze dates for this month
  const frozenDates = new Set();
  (user.freezeDates || []).forEach(ds => {
    const parts = ds.split('-');
    if (parseInt(parts[0]) === year && parseInt(parts[1]) === month + 1) {
      frozenDates.add(parseInt(parts[2]));
    }
  });

  const todayDate = new Date();
  const isCurrentMonth = todayDate.getFullYear() === year && todayDate.getMonth() === month;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0

  const headers = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  let html = headers.map(h => `<div class="calendar-day-header">${h}</div>`).join('');

  // Empty cells before first day
  for (let i = 0; i < startDow; i++) {
    html += '<div class="calendar-day"></div>';
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const practiced = practicedDates.has(day);
    const frozen = frozenDates.has(day);
    const isToday = isCurrentMonth && day === todayDate.getDate();
    const classes = ['calendar-day'];
    if (isToday) classes.push('today');

    if (practiced) {
      classes.push('cal-practiced');
      html += `<div class="${classes.join(' ')}"><span class="cal-circle">${day}</span></div>`;
    } else if (frozen) {
      classes.push('cal-frozen');
      html += `<div class="${classes.join(' ')}"><span class="cal-circle">${day}</span></div>`;
    } else {
      html += `<div class="${classes.join(' ')}">${day}</div>`;
    }
  }

  document.getElementById('calendar-grid').innerHTML = html;
}

function streakCalendarNav(dir) {
  calendarViewDate.setMonth(calendarViewDate.getMonth() + dir);
  renderStreakCalendar();
}

// Milestones
function renderMilestones() {
  const user = getCurrentUser();
  if (!user) return;
  const streak = user.streak || 0;
  const claimed = user.claimedMilestones || [];

  const el = document.getElementById('milestones-list');
  el.innerHTML = MILESTONES.map(m => {
    const isClaimed = claimed.includes(m.days);
    const isClaimable = streak >= m.days && !isClaimed;
    const isLocked = streak < m.days && !isClaimed;

    let statusHtml;
    if (isClaimed) {
      statusHtml = '<span style="color:#81c784;font-weight:700;">Claimed ✓</span>';
    } else if (isClaimable) {
      statusHtml = `<button class="btn btn-sm btn-success" onclick="claimMilestone(${m.days})">Claim</button>`;
    } else {
      statusHtml = `<span style="color:var(--text-muted);font-size:0.82rem;">${m.days - streak} days left</span>`;
    }

    const itemClass = 'milestone-item' + (isLocked ? ' milestone-locked' : '') + (isClaimed ? ' milestone-claimed' : '');
    return `<div class="${itemClass}">
      <div class="milestone-info">
        <div class="milestone-days">${m.days} Day Streak</div>
        <div class="milestone-reward">+${m.reward} bonus minutes</div>
      </div>
      <div>${statusHtml}</div>
    </div>`;
  }).join('');
}

async function claimMilestone(days) {
  const user = getCurrentUser();
  if (!user) return;
  if (!user.claimedMilestones) user.claimedMilestones = [];
  if (user.claimedMilestones.includes(days)) return;

  const milestone = MILESTONES.find(m => m.days === days);
  if (!milestone || (user.streak || 0) < days) return;

  user.claimedMilestones.push(days);
  user.minutesBank += milestone.reward;
  await updateUser(user);
  renderMilestones();
  refreshApp();
}

// ==================== STOPWATCH ====================
let swInterval = null;
let swAccumulated = 0; // ms accumulated from previous runs
let swStartTime = null; // timestamp when current run started
let swRunning = false;

function swGetElapsed() {
  let total = swAccumulated;
  if (swRunning && swStartTime) total += Date.now() - swStartTime;
  return Math.floor(total / 1000);
}

function swStart() {
  swRunning = true;
  swStartTime = Date.now();
  document.getElementById('btn-sw-start').style.display = 'none';
  document.getElementById('btn-sw-pause').style.display = '';
  document.getElementById('btn-sw-reset').style.display = '';
  document.getElementById('sw-add-wrap').classList.add('hidden');
  swInterval = setInterval(() => swUpdateDisplay(), 500);
}

function swPause() {
  swAccumulated += Date.now() - swStartTime;
  swRunning = false;
  swStartTime = null;
  clearInterval(swInterval);
  swInterval = null;
  swUpdateDisplay();
  document.getElementById('btn-sw-pause').style.display = 'none';
  document.getElementById('btn-sw-start').textContent = 'Resume';
  document.getElementById('btn-sw-start').style.display = '';

  const elapsed = swGetElapsed();
  const totalMins = Math.floor(elapsed / 60);
  const msg = document.getElementById('sw-add-msg');
  if (totalMins > 0) {
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    const dur = h > 0 ? `${h}h ${m}m` : `${m}m`;
    msg.textContent = `Add ${dur} of practice to your balance?`;
    document.getElementById('sw-add-wrap').classList.remove('hidden');
    document.querySelector('#sw-add-wrap .btn').style.display = '';
  } else {
    msg.textContent = 'Practice for at least 1 minute to log it.';
    document.getElementById('sw-add-wrap').classList.remove('hidden');
    document.querySelector('#sw-add-wrap .btn').style.display = 'none';
  }
}

function swReset() {
  clearInterval(swInterval);
  swInterval = null;
  swAccumulated = 0;
  swStartTime = null;
  swRunning = false;
  swUpdateDisplay();
  document.getElementById('btn-sw-start').textContent = 'Start';
  document.getElementById('btn-sw-start').style.display = '';
  document.getElementById('btn-sw-pause').style.display = 'none';
  document.getElementById('btn-sw-reset').style.display = 'none';
  document.getElementById('sw-add-wrap').classList.add('hidden');
  document.querySelector('#sw-add-wrap .btn').style.display = '';
}

async function swAddMinutes() {
  const totalMins = Math.floor(swGetElapsed() / 60);
  if (totalMins <= 0) return;
  const user = getCurrentUser();
  user.minutesBank += totalMins;
  user.practiceLog.push({ date: new Date().toISOString(), minutes: totalMins });
  updateStreak(user);
  await updateUser(user);
  saveBackup();
  showToast('Practice saved!');
  swReset();
  refreshApp();
}

function swUpdateDisplay() {
  const elapsed = swGetElapsed();
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  document.getElementById('stopwatch-display').textContent =
    String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ==================== TIMER ====================
let timerInterval = null;
let timerStartTime = null;
let overtimeInterval = null;
let overtimeStartTime = null;
let audioCtx = null;

function timerGetElapsedSeconds() {
  if (!timerStartTime) return 0;
  return Math.floor((Date.now() - timerStartTime) / 1000);
}

function startTimer() {
  const user = getCurrentUser();
  if (user.minutesBank <= 0) return;
  timerStartTime = Date.now();
  document.getElementById('timer-setup').classList.add('hidden');
  document.getElementById('timer-running').classList.remove('hidden');
  document.getElementById('timer-finished').classList.add('hidden');
  updateTimerDisplay();
  timerInterval = setInterval(timerTick, 500);
}

function timerTick() {
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const elapsed = timerGetElapsedSeconds();
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  document.getElementById('timer-countdown').textContent =
    String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  const user = getCurrentUser();
  const usedMinutes = Math.ceil(elapsed / 60);
  const remaining = Math.max(0, user.minutesBank - usedMinutes);
  document.getElementById('timer-remaining-note').textContent =
    `${remaining} minutes remaining`;
}

function cancelTimer() {
  clearInterval(timerInterval); timerInterval = null;
  clearInterval(overtimeInterval); overtimeInterval = null;
  timerStartTime = null;
  document.getElementById('timer-setup').classList.remove('hidden');
  document.getElementById('timer-running').classList.add('hidden');
  document.getElementById('timer-finished').classList.add('hidden');
}

async function finishUsage() {
  clearInterval(timerInterval); timerInterval = null;
  const elapsed = timerGetElapsedSeconds();
  const usedMinutes = Math.ceil(elapsed / 60);
  timerStartTime = null;

  const user = getCurrentUser();
  user.minutesBank = Math.max(0, user.minutesBank - usedMinutes);
  const today = getTodayStr();
  user.usageLog.push({ date: today, minutesUsed: usedMinutes, overtime: false });
  await updateUser(user);

  const msgEl = document.getElementById('timer-end-message');
  if (usedMinutes === 0) {
    msgEl.textContent = 'No minutes used.';
    msgEl.className = 'message message-success';
  } else if (user.minutesBank <= 0) {
    msgEl.textContent = `Used ${usedMinutes} minutes. You don't have any more minutes left.`;
    msgEl.className = 'message message-danger';
  } else {
    msgEl.textContent = `Used ${usedMinutes} minutes. You have ${user.minutesBank} minutes left.`;
    msgEl.className = 'message message-success';
  }

  document.getElementById('timer-running').classList.add('hidden');
  document.getElementById('timer-finished').classList.remove('hidden');
  refreshApp();
}

function dismissTimer() {
  stopAlarm();
  clearInterval(overtimeInterval); overtimeInterval = null;
  hideUserOvertimeBanner();
  document.getElementById('timer-finished').classList.add('hidden');
  document.getElementById('timer-setup').classList.remove('hidden');
  refreshApp();
}

function educationalBypass() {
  stopAlarm();
  clearInterval(overtimeInterval); overtimeInterval = null;
  document.getElementById('timer-finished').classList.add('hidden');
  document.getElementById('timer-setup').classList.remove('hidden');
  refreshApp();
}

// ==================== OVERTIME TRACKING ====================
const OVERTIME_THRESHOLD = 60; // seconds (set to 60 for testing, change to 600 for production)

function startOvertimeTracking() {
  overtimeStartTime = Date.now();
  clearInterval(overtimeInterval);
  overtimeInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - overtimeStartTime) / 1000);
    if (elapsed >= OVERTIME_THRESHOLD) {
      clearInterval(overtimeInterval);
      overtimeInterval = null;
      flagOvertime();
    }
  }, 1000);
}

async function flagOvertime() {
  const user = getCurrentUser();
  if (user.usageLog.length > 0) {
    user.usageLog[user.usageLog.length - 1].overtime = true;
  }
  await updateUser(user);

  sendNotification('Instrument Minutes', 'You have gone over your screen time limit!');
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

  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7;
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

async function setTheme(name) {
  const user = getCurrentUser();
  user.theme = name;
  await updateUser(user);
  applyTheme(name, getMode(user));
  renderThemePicker(name);
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

async function setMode(mode) {
  const user = getCurrentUser();
  user.mode = mode;
  await updateUser(user);
  applyTheme(user.theme || 'pink', mode);
  updateModeButtons(mode);
}

function updateModeButtons(mode) {
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

// ==================== SHOP ====================
const STREAK_FREEZE_COST = 30;
const STREAK_FREEZE_MAX = 2;

function freezeIconSVG(size) {
  return `<svg viewBox="-5 -3 110 155" width="${size}" height="${size}">
    <path d="M50 8C50 8 26 35 12 60C2 76 0 88 0 96A50 50 0 0 0 100 96C100 88 98 76 88 60C74 35 50 8 50 8Z" fill="#5CC6F2" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>
    <path d="M50 60C50 60 34 82 31 96C28 108 37 117 50 117C63 117 72 108 69 96C66 82 50 60 50 60Z" fill="#8ED8F8"/>
  </svg>`;
}

function renderShop() {
  const user = getCurrentUser();
  if (!user) return;
  const freezes = user.streakFreezes || 0;
  const canBuy = user.minutesBank >= STREAK_FREEZE_COST && freezes < STREAK_FREEZE_MAX;

  const contentEl = document.getElementById('shop-content');
  contentEl.innerHTML = `
    <div class="shop-freeze-count">
      ${freezeIconSVG(80)}
      <div class="shop-freeze-number">${freezes} / ${STREAK_FREEZE_MAX}</div>
      <div class="shop-freeze-label">streak freezes owned</div>
    </div>
    <div class="shop-item">
      <div class="shop-item-info">
        <div class="shop-item-name">Streak Freeze</div>
        <div class="shop-item-desc">Protects your streak if you miss a day</div>
        <div class="shop-item-cost">${STREAK_FREEZE_COST} minutes</div>
      </div>
      <button class="btn btn-sm${canBuy ? '' : ' btn-outline'}" onclick="buyStreakFreeze()" ${canBuy ? '' : 'disabled'}>
        ${freezes >= STREAK_FREEZE_MAX ? 'Max owned' : user.minutesBank < STREAK_FREEZE_COST ? 'Not enough' : 'Buy'}
      </button>
    </div>
  `;

  const historyEl = document.getElementById('shop-history');
  const log = (user.purchaseLog || []).slice().reverse();
  if (log.length === 0) {
    historyEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.88rem;">No purchases yet.</p>';
  } else {
    historyEl.innerHTML = log.map(e => `
      <div class="purchase-history-item">
        <span>${e.item}</span>
        <span style="color:var(--text-muted);">${e.date} · ${e.cost}m</span>
      </div>
    `).join('');
  }
}

async function buyStreakFreeze() {
  const user = getCurrentUser();
  if (!user) return;
  if (!user.streakFreezes) user.streakFreezes = 0;
  if (!user.purchaseLog) user.purchaseLog = [];
  if (user.minutesBank < STREAK_FREEZE_COST) return;
  if (user.streakFreezes >= STREAK_FREEZE_MAX) return;
  user.minutesBank -= STREAK_FREEZE_COST;
  user.streakFreezes++;
  user.purchaseLog.push({ date: getTodayStr(), item: 'Streak Freeze', cost: STREAK_FREEZE_COST });
  await updateUser(user);
  refreshApp();
  renderShop();
}

// ==================== ADMIN DASHBOARD ====================
async function renderAdmin() {
  // Reload from Gist to get latest data from all devices
  await loadDB();
  const profiles = getProfiles().filter(p => !p.isAdmin);
  const bannerEl = document.getElementById('admin-overtime-banners');
  const gridEl = document.getElementById('admin-users-grid');
  const weeklyEl = document.getElementById('admin-weekly');

  // Overtime banners
  const overtimeUsers = profiles.filter(p => p.usageLog.some(e => e.overtime));
  bannerEl.innerHTML = overtimeUsers.map(u => {
    const count = u.usageLog.filter(e => e.overtime).length;
    return `<div class="overtime-banner">${u.name} has ${count} overtime violation${count > 1 ? 's' : ''} (stayed 10+ min past timer with no minutes left)</div>`;
  }).join('');

  // User cards grid
  gridEl.innerHTML = profiles.map(u => {
    const totalEarned = u.practiceLog.reduce((s, e) => s + e.minutes, 0);
    const totalUsed = u.usageLog.reduce((s, e) => s + e.minutesUsed, 0);
    const overtimeCount = u.usageLog.filter(e => e.overtime).length;
    return `<div class="admin-user-card">
      <h3>${u.name}</h3>
      <div class="admin-big-minutes">${u.minutesBank}</div>
      <div class="admin-minutes-label">minutes left</div>
      <div class="admin-user-stats">
        <div>Earned <span>${totalEarned}m</span></div>
        <div>Used <span>${totalUsed}m</span></div>
        <div>Overtime <span${overtimeCount > 0 ? ' style="color:#e65100;"' : ''}>${overtimeCount}</span></div>
      </div>
    </div>`;
  }).join('');

  if (profiles.length === 0) {
    gridEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;">No users yet.</p>';
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

  // Purchase history
  const purchasesEl = document.getElementById('admin-purchases');
  const usersWithPurchases = profiles.filter(p => (p.purchaseLog || []).length > 0);
  if (usersWithPurchases.length === 0) {
    purchasesEl.innerHTML = '<p style="color:var(--text-muted);">No purchases yet.</p>';
  } else {
    purchasesEl.innerHTML = usersWithPurchases.map(u => {
      const log = (u.purchaseLog || []).slice().reverse();
      return `<div style="margin-bottom:14px;">
        <h3 style="margin-bottom:8px;">${u.name} <span style="font-weight:400;color:var(--text-muted);font-size:0.82rem;">· ${u.streakFreezes || 0} freeze${(u.streakFreezes || 0) !== 1 ? 's' : ''} owned</span></h3>
        ${log.map(e => `<div class="purchase-history-item">
          <span>${e.item}</span>
          <span style="color:var(--text-muted);">${e.date} · ${e.cost}m</span>
        </div>`).join('')}
      </div>`;
    }).join('');
  }
}

// ==================== DELETE PROFILE ====================
async function deleteProfile() {
  const user = getCurrentUser();
  if (!user) return;
  if (!confirm(`Are you sure you want to delete the profile "${user.name}"? This cannot be undone.`)) return;
  db.profiles = db.profiles.filter(p => p.id !== user.id);
  await saveDB();
  localStorage.removeItem('im_currentUser');
  cancelTimer();
  showScreen('screen-auth');
  showLogin();
}

// ==================== SECRET TERMINAL ====================
let terminalHistory = [];
let terminalHistoryIdx = -1;

function toggleTerminal() {
  const panel = document.getElementById('terminal-panel');
  const backdrop = document.getElementById('terminal-backdrop');
  panel.classList.toggle('hidden');
  backdrop.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    document.getElementById('terminal-input').focus();
  }
}

document.addEventListener('keydown', (e) => {
  if (e.metaKey && e.shiftKey && e.key === '\\') {
    e.preventDefault();
    toggleTerminal();
    return;
  }
  const panel = document.getElementById('terminal-panel');
  if (e.key === 'Escape' && panel && !panel.classList.contains('hidden')) {
    e.preventDefault();
    toggleTerminal();
  }
});

function termAppendLine(text, className) {
  const output = document.getElementById('terminal-output');
  const div = document.createElement('div');
  div.textContent = text;
  if (className) div.className = className;
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
}

function handleTerminalCommand(input) {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  if (cmd === '/help') return termCmdHelp();
  if (cmd === '/status') return termCmdStatus();
  if (cmd === '/version') return termCmdVersion();
  if (cmd === '/clear' && parts.length === 1) {
    document.getElementById('terminal-output').innerHTML = '';
    return;
  }
  if (cmd === '/set') return termCmdSet(parts.slice(1));
  if (cmd === '/add') return termCmdAdd(parts.slice(1));
  if (cmd === '/clear') return termCmdClearData(parts.slice(1));
  termAppendLine('Unknown command: ' + cmd + '. Type /help for commands.', 'term-err');
}

function termCmdHelp() {
  termAppendLine('COMMANDS', 'term-heading');
  const cmds = [
    '/help                        Show this help',
    '/status                      Show current user stats',
    '/version                     Show app version',
    '/clear                       Clear terminal output',
    '/set minutes <n>             Set minutesBank to n',
    '/add minutes <n>             Add n to minutesBank',
    '/set streak <n>              Set streak count',
    '/clear usage                 Clear all usage log entries',
    '/clear practice              Clear all practice log entries',
    '/add usage <mins> [date]     Add usage entry (YYYY-MM-DD)',
    '/add practice <mins> [date]  Add practice entry (YYYY-MM-DD)',
  ];
  cmds.forEach(c => termAppendLine(c, 'term-info'));
}

function termCmdStatus() {
  const user = getCurrentUser();
  if (!user) { termAppendLine('No user logged in.', 'term-err'); return; }
  const totalPractice = user.practiceLog.reduce((s, e) => s + e.minutes, 0);
  const totalUsage = user.usageLog.reduce((s, e) => s + e.minutesUsed, 0);
  const overtimeCount = user.usageLog.filter(e => e.overtime).length;
  termAppendLine('USER STATUS', 'term-heading');
  termAppendLine('Name:             ' + user.name, 'term-ok');
  termAppendLine('Role:             ' + (user.isAdmin ? 'Admin' : 'User'), 'term-ok');
  termAppendLine('Minutes Bank:     ' + user.minutesBank, 'term-ok');
  termAppendLine('Streak:           ' + (user.streak || 0) + ' days', 'term-ok');
  termAppendLine('Last Practice:    ' + (user.lastPracticeDate || 'never'), 'term-ok');
  termAppendLine('Practice Entries: ' + user.practiceLog.length + ' (' + totalPractice + 'm total)', 'term-ok');
  termAppendLine('Usage Entries:    ' + user.usageLog.length + ' (' + totalUsage + 'm total)', 'term-ok');
  termAppendLine('Overtime:         ' + overtimeCount, 'term-ok');
}

function termCmdVersion() {
  termAppendLine('Instrument Minutes v' + APP_VERSION, 'term-info');
}

async function termCmdSet(args) {
  const user = getCurrentUser();
  if (!user) { termAppendLine('No user logged in.', 'term-err'); return; }
  const field = (args[0] || '').toLowerCase();
  const value = parseInt(args[1]);
  if (field === 'minutes' && !isNaN(value)) {
    user.minutesBank = Math.max(0, value);
    await updateUser(user);
    refreshApp();
    termAppendLine('minutesBank set to ' + user.minutesBank, 'term-ok');
  } else if (field === 'streak' && !isNaN(value)) {
    user.streak = Math.max(0, value);
    if (value > 0) user.lastPracticeDate = getTodayStr();
    await updateUser(user);
    refreshApp();
    termAppendLine('streak set to ' + user.streak, 'term-ok');
  } else {
    termAppendLine('Usage: /set minutes <n> | /set streak <n>', 'term-err');
  }
}

async function termCmdAdd(args) {
  const user = getCurrentUser();
  if (!user) { termAppendLine('No user logged in.', 'term-err'); return; }
  const field = (args[0] || '').toLowerCase();
  const value = parseInt(args[1]);
  if (field === 'minutes' && !isNaN(value)) {
    user.minutesBank = Math.max(0, user.minutesBank + value);
    await updateUser(user);
    refreshApp();
    termAppendLine('Added ' + value + '. minutesBank is now ' + user.minutesBank, 'term-ok');
  } else if (field === 'usage' && !isNaN(value)) {
    const date = args[2] || getTodayStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      termAppendLine('Invalid date format. Use YYYY-MM-DD.', 'term-err'); return;
    }
    user.usageLog.push({ date, minutesUsed: value, overtime: false });
    await updateUser(user);
    refreshApp();
    termAppendLine('Added usage entry: ' + value + 'm on ' + date, 'term-ok');
  } else if (field === 'practice' && !isNaN(value)) {
    const dateArg = args[2];
    if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
      termAppendLine('Invalid date format. Use YYYY-MM-DD.', 'term-err'); return;
    }
    const date = dateArg ? dateArg + 'T12:00:00.000Z' : new Date().toISOString();
    user.practiceLog.push({ date, minutes: value });
    await updateUser(user);
    refreshApp();
    termAppendLine('Added practice entry: ' + value + 'm on ' + date.slice(0, 10), 'term-ok');
  } else {
    termAppendLine('Usage: /add minutes <n> | /add usage <mins> [date] | /add practice <mins> [date]', 'term-err');
  }
}

async function termCmdClearData(args) {
  const user = getCurrentUser();
  if (!user) { termAppendLine('No user logged in.', 'term-err'); return; }
  const target = (args[0] || '').toLowerCase();
  if (target === 'usage') {
    const count = user.usageLog.length;
    user.usageLog = [];
    await updateUser(user);
    refreshApp();
    termAppendLine('Cleared ' + count + ' usage log entries.', 'term-ok');
  } else if (target === 'practice') {
    const count = user.practiceLog.length;
    user.practiceLog = [];
    await updateUser(user);
    refreshApp();
    termAppendLine('Cleared ' + count + ' practice log entries.', 'term-ok');
  } else {
    termAppendLine('Usage: /clear usage | /clear practice', 'term-err');
  }
}

// ==================== WHAT'S NEW ====================
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function checkWhatsNew(user) {
  if (!user) return;
  const key = 'im_whatsNew_' + user.id;
  const lastSeen = localStorage.getItem(key);
  if (lastSeen === APP_VERSION) return;

  // Collect entries newer than lastSeen
  let entries;
  if (!lastSeen) {
    // First time — just show the current version
    entries = CHANGELOG.filter(e => e.version === APP_VERSION);
  } else {
    entries = CHANGELOG.filter(e => compareVersions(e.version, lastSeen) > 0);
  }
  if (entries.length === 0) {
    localStorage.setItem(key, APP_VERSION);
    return;
  }

  // Sort oldest first for display
  entries.sort((a, b) => compareVersions(a.version, b.version));
  showWhatsNew(entries);
}

function showWhatsNew(entries) {
  const popup = document.getElementById('whats-new-popup');
  const content = document.getElementById('whats-new-content');
  content.innerHTML = entries.map(e =>
    `<div class="whats-new-entry">
      <span class="whats-new-version">v${e.version}</span>
      <span>${e.notes}</span>
    </div>`
  ).join('');
  popup.classList.remove('hidden');
}

function dismissWhatsNew() {
  const user = getCurrentUser();
  if (user) {
    localStorage.setItem('im_whatsNew_' + user.id, APP_VERSION);
  }
  document.getElementById('whats-new-popup').classList.add('hidden');
}

// ==================== INIT ====================
(async function init() {
  document.getElementById('version-badge').textContent = 'v' + APP_VERSION;
  await loadDB();
  document.getElementById('loading-overlay').remove();

  // Terminal input handler
  const termInput = document.getElementById('terminal-input');
  termInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const cmd = termInput.value.trim();
      if (!cmd) return;
      terminalHistory.unshift(cmd);
      terminalHistoryIdx = -1;
      termAppendLine('> ' + cmd, 'term-cmd');
      handleTerminalCommand(cmd);
      termInput.value = '';
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (terminalHistoryIdx < terminalHistory.length - 1) {
        terminalHistoryIdx++;
        termInput.value = terminalHistory[terminalHistoryIdx];
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (terminalHistoryIdx > 0) {
        terminalHistoryIdx--;
        termInput.value = terminalHistory[terminalHistoryIdx];
      } else {
        terminalHistoryIdx = -1;
        termInput.value = '';
      }
    }
  });

  const user = getCurrentUser();
  if (user) {
    checkWhatsNew(user);
    enterApp();
  }
})();
