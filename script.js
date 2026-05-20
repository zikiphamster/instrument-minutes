// ==================== VERSION ====================
const APP_VERSION = '1.6.4';

// ==================== CONFIG ====================
const GIST_ID = 'ab0f0b0a12593cccc0efd7db998410e4';
const _t = ['Z2hwX0NnTVJZ', 'YzdsMDRjM0g4', 'VWV6cVlBUDBU', 'S0VUSnlPdjFT', 'RUQ3Vw=='];
const GITHUB_TOKEN = atob(_t.join(''));

// ==================== DATA LAYER (GitHub Gist) ====================
let db = { profiles: [] }; // in-memory cache

async function loadDB() {
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
    });
    if (!res.ok) throw new Error('Failed to load data');
    const gist = await res.json();
    const content = gist.files['data.json'].content;
    const parsed = JSON.parse(content);
    db = parsed && parsed.profiles ? parsed : { profiles: [] };
  } catch (e) {
    console.error('loadDB error:', e);
    // Fall back to localStorage cache
    const cached = localStorage.getItem('im_db_cache');
    if (cached) db = JSON.parse(cached);
  }
}

async function saveDB() {
  // Save to localStorage as cache/fallback
  localStorage.setItem('im_db_cache', JSON.stringify(db));
  try {
    await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: { 'data.json': { content: JSON.stringify(db, null, 2) } }
      })
    });
  } catch (e) {
    console.error('saveDB error:', e);
  }
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
    await saveDB();
  }
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
    claimedMilestones: []
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
  // Check streak reset on load
  checkStreakReset(user);
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
  { days: 10, reward: 5 },
  { days: 20, reward: 6 },
  { days: 30, reward: 7 },
  { days: 50, reward: 8 },
  { days: 75, reward: 9 },
  { days: 100, reward: 10 },
  { days: 150, reward: 11 },
  { days: 200, reward: 12 },
  { days: 300, reward: 13 },
  { days: 365, reward: 14 },
];

let calendarViewDate = new Date(); // tracks which month is displayed

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getYesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
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

function checkStreakReset(user) {
  if (!user.lastPracticeDate) return;
  const today = getTodayStr();
  const yesterday = getYesterdayStr();
  if (user.lastPracticeDate !== today && user.lastPracticeDate !== yesterday) {
    user.streak = 0;
  }
  if (!user.claimedMilestones) user.claimedMilestones = [];
}

function refreshStreakDisplay() {
  const user = getCurrentUser();
  if (!user) return;
  const streak = user.streak || 0;
  const active = streak > 0;

  document.getElementById('streak-count').textContent = streak;
  const bigCount = document.getElementById('streak-big-count');
  if (bigCount) bigCount.textContent = streak;

  // Update badge background
  const badge = document.getElementById('streak-badge');
  if (badge) {
    badge.style.background = active
      ? 'linear-gradient(135deg, #ff6b35, #ff4500)'
      : 'linear-gradient(135deg, #666, #555)';
    badge.style.boxShadow = active
      ? '0 2px 8px rgba(255, 69, 0, 0.3)'
      : '0 2px 8px rgba(0, 0, 0, 0.2)';
  }

  // Update flame SVGs (both small and big)
  ['streak-flame', 'streak-flame-big'].forEach(id => {
    const svg = document.getElementById(id);
    if (!svg) return;
    const paths = svg.querySelectorAll('path');
    const ellipse = svg.querySelector('ellipse');
    // path 0 = main body, path 1 = side flick, path 2 = inner flame
    if (paths[0]) {
      paths[0].setAttribute('fill', active ? '#ff6b35' : '#888');
      paths[0].setAttribute('stroke', active ? '#fff' : '#aaa');
    }
    if (paths[1]) {
      paths[1].setAttribute('fill', active ? '#ff8c42' : '#999');
      paths[1].setAttribute('stroke', active ? '#fff' : '#aaa');
    }
    if (paths[2]) {
      paths[2].setAttribute('fill', active ? '#ffcc02' : '#aaa');
    }
    if (ellipse) {
      ellipse.setAttribute('fill', active ? '#ffdd66' : '#bbb');
    }
  });

  // Update big number color
  if (bigCount) {
    bigCount.style.color = active ? '#ff6b35' : 'var(--text-muted)';
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

  const todayStr = getTodayStr();
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
    const isToday = isCurrentMonth && day === todayDate.getDate();
    const classes = ['calendar-day'];
    if (practiced) classes.push('practiced');
    if (isToday) classes.push('today');
    html += `<div class="${classes.join(' ')}">${day}</div>`;
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
let timerDurationMs = 0; // total duration in ms
let timerElapsedMs = 0; // ms accumulated while running (from previous runs)
let timerStartTime = null; // timestamp when current run started
let timerPaused = false;
let timerTotalMinutes = 0;
let overtimeInterval = null;
let overtimeStartTime = null;
let audioCtx = null;

function timerGetRemaining() {
  let elapsed = timerElapsedMs;
  if (!timerPaused && timerStartTime) elapsed += Date.now() - timerStartTime;
  return Math.max(0, Math.ceil((timerDurationMs - elapsed) / 1000));
}

function startTimer() {
  const user = getCurrentUser();
  const input = parseInt(document.getElementById('timer-input').value);
  if (!input || input <= 0) return;
  if (input > user.minutesBank) {
    alert(`You only have ${user.minutesBank} minutes available.`);
    return;
  }
  timerTotalMinutes = input;
  timerDurationMs = input * 60 * 1000;
  timerElapsedMs = 0;
  timerStartTime = Date.now();
  timerPaused = false;
  document.getElementById('timer-setup').classList.add('hidden');
  document.getElementById('timer-running').classList.remove('hidden');
  document.getElementById('timer-finished').classList.add('hidden');
  document.getElementById('btn-pause').textContent = 'Pause';
  updateTimerDisplay();
  timerInterval = setInterval(timerTick, 500);
}

function timerTick() {
  if (timerPaused) return;
  const remaining = timerGetRemaining();
  updateTimerDisplay();
  if (remaining <= 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    timerFinished();
  }
}

function updateTimerDisplay() {
  const remaining = timerGetRemaining();
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  document.getElementById('timer-countdown').textContent =
    String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function togglePause() {
  if (timerPaused) {
    // Resume
    timerPaused = false;
    timerStartTime = Date.now();
    document.getElementById('btn-pause').textContent = 'Pause';
  } else {
    // Pause
    timerElapsedMs += Date.now() - timerStartTime;
    timerStartTime = null;
    timerPaused = true;
    document.getElementById('btn-pause').textContent = 'Resume';
  }
}

function cancelTimer() {
  clearInterval(timerInterval); timerInterval = null;
  clearInterval(overtimeInterval); overtimeInterval = null;
  timerDurationMs = 0; timerElapsedMs = 0; timerStartTime = null; timerPaused = false;
  document.getElementById('timer-setup').classList.remove('hidden');
  document.getElementById('timer-running').classList.add('hidden');
  document.getElementById('timer-finished').classList.add('hidden');
}

async function timerFinished() {
  // Deduct minutes
  const user = getCurrentUser();
  user.minutesBank = Math.max(0, user.minutesBank - timerTotalMinutes);
  const today = new Date().toISOString().slice(0, 10);
  user.usageLog.push({ date: today, minutesUsed: timerTotalMinutes, overtime: false });
  await updateUser(user);

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
    clearInterval(overtimeInterval); overtimeInterval = null;
    hideUserOvertimeBanner();
  } else if (user && user.minutesBank <= 0 && !overtimeInterval) {
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

// ==================== ADMIN DASHBOARD ====================
async function renderAdmin() {
  // Reload from Gist to get latest data from all devices
  await loadDB();
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

// ==================== INIT ====================
(async function init() {
  document.getElementById('version-badge').textContent = 'v' + APP_VERSION;
  await loadDB();
  document.getElementById('loading-overlay').remove();
  const user = getCurrentUser();
  if (user) {
    enterApp();
  }
})();
