import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { getDatabase, ref, set, onValue, off } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'hn_state';
const DARK_KEY = 'hn_dark';
const emptyState = () => ({ dailyTasks: {}, events: [], dump: [], seasons: [] });

const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const todayObj = new Date();
const TODAY_ISO = toISO(todayObj);

const normalize = (raw) => ({
  dailyTasks: raw?.dailyTasks || {},
  events: Array.isArray(raw?.events) ? raw.events : [],
  dump: Array.isArray(raw?.dump) ? raw.dump : [],
  seasons: Array.isArray(raw?.seasons) ? raw.seasons : []
});

let state = (() => {
  try { return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { return emptyState(); }
})();

// --- Light / Dark Mode ---
const darkModeBtn = $('darkModeBtn');
function syncDarkLabel() {
  darkModeBtn.textContent = document.documentElement.classList.contains('dark') ? 'Switch to Light Mode' : 'Switch to Dark Mode';
}
syncDarkLabel();
darkModeBtn.onclick = () => {
  const isDark = document.documentElement.classList.toggle('dark');
  try { localStorage.setItem(DARK_KEY, isDark ? '1' : '0'); } catch {}
  syncDarkLabel();
};

// --- Firebase Auth + UID Sync ---
const app = initializeApp(window.APP_CONFIG.firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const provider = new GoogleAuthProvider();
const syncPill = $('syncPill');
let dbRef = null;

const setSync = (text, offline = false) => {
  syncPill.textContent = text;
  syncPill.classList.toggle('offline', offline);
};

$('loginBtn').onclick = () => signInWithPopup(auth, provider).catch((e) => alert(e.message));
$('signOutBtn').onclick = () => {
  localStorage.removeItem(STORAGE_KEY);
  signOut(auth);
  $('settingsModal').classList.remove('open');
};

onAuthStateChanged(auth, (user) => {
  if (dbRef) { off(dbRef); dbRef = null; }
  document.body.dataset.auth = user ? 'true' : 'false';

  if (!user) {
    state = emptyState();
    return;
  }

  dbRef = ref(db, `users/${user.uid}`);
  onValue(dbRef, (snap) => {
    setSync('● Synced');
    if (snap.exists()) {
      state = normalize(snap.val());
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
      updateDumpBadge();
      switchView(currentView);
    } else {
      set(dbRef, state);
    }
  }, () => setSync('Check Rules', true));
});

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  if (!dbRef) return;
  setSync('Syncing...');
  set(dbRef, state)
    .then(() => setSync('● Synced'))
    .catch(() => setSync('Check Rules', true));
}

// --- Navigation & Swipe ---
const VIEWS = ['year', 'month', 'day'];
let currentView = 'day';
let selectedDateISO = TODAY_ISO;
let viewYear = todayObj.getFullYear();
let viewMonth = todayObj.getMonth();

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.zoom-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view-section').forEach((s) => s.classList.toggle('active', s.id === `view-${view}`));
  if (view === 'day') renderDayView();
  if (view === 'month') renderMonthView();
  if (view === 'year') renderYearView();
}
document.querySelectorAll('.zoom-btn').forEach((b) => (b.onclick = () => switchView(b.dataset.view)));

let touchX = 0, touchY = 0;
document.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }
}, { passive: true });

document.addEventListener('touchend', (e) => {
  if (e.changedTouches.length !== 1 || document.body.dataset.auth !== 'true') return;
  if (document.querySelector('.overlay.open, .modal-center.open, .focus-sanctuary.open')) return;

  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    const idx = VIEWS.indexOf(currentView);
    if (dx < 0 && idx < 2) switchView(VIEWS[idx + 1]);
    if (dx > 0 && idx > 0) switchView(VIEWS[idx - 1]);
  }
}, { passive: true });

// --- Day View ---
function renderDayView() {
  const [y, m, d] = selectedDateISO.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const isToday = selectedDateISO === TODAY_ISO;

  $('navDayBtn').textContent = isToday ? 'Today' : `${dateObj.toLocaleString('en-US', { month: 'short' })} ${d}`;
  $('selectedDateFull').textContent = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
  $('backToTodayBtn').style.display = isToday ? 'none' : 'inline-flex';

  const seasons = state.seasons.filter((s) => m >= s.startMonth && m <= s.endMonth);
  const pills = $('activeSeasonsPills');
  pills.style.display = seasons.length ? 'flex' : 'none';
  pills.innerHTML = seasons.map((s) => `<span class="season-pill">${esc(s.title)}</span>`).join('');

  const tasks = state.dailyTasks[selectedDateISO] || [];
  $('daily3Count').textContent = tasks.length;
  const listEl = $('daily3List');
  listEl.innerHTML = '';

  tasks.forEach((task, idx) => {
    const div = document.createElement('div');
    div.className = `task-card ${task.done ? 'done' : ''}`;
    div.innerHTML = `
      <button class="task-check">${task.done ? '✓' : idx + 1}</button>
      <div class="task-body"><div class="task-title">${esc(task.title)}</div></div>
      <div class="task-actions">
        <button class="btn-focus-sm">Focus</button>
        <button class="btn-ghost-sm" title="Move to Dump">↩</button>
      </div>`;
    div.querySelector('.task-check').onclick = () => { task.done = !task.done; saveState(); renderDayView(); };
    div.querySelector('.btn-focus-sm').onclick = () => openFocus(task.title);
    div.querySelector('.btn-ghost-sm').onclick = () => {
      state.dump.unshift({ id: 'd' + Date.now(), text: task.title });
      state.dailyTasks[selectedDateISO] = tasks.filter((t) => t.id !== task.id);
      saveState(); updateDumpBadge(); renderDayView();
    };
    listEl.appendChild(div);
  });

  if (tasks.length < 3) {
    const form = document.createElement('form');
    form.className = 'empty-slot';
    form.innerHTML = `<input type="text" placeholder="+ Priority #${tasks.length + 1}..." required /><button type="submit" class="btn-focus-sm">Add</button>`;
    form.onsubmit = (e) => {
      e.preventDefault();
      const val = form.querySelector('input').value.trim();
      if (!val) return;
      (state.dailyTasks[selectedDateISO] ||= []).push({ id: 't' + Date.now(), title: val, done: false });
      saveState(); renderDayView();
    };
    listEl.appendChild(form);
  }

  const dayEvents = state.events.filter((ev) => ev.date === selectedDateISO);
  const evBox = $('dayEventsContainer');
  evBox.innerHTML = dayEvents.length
    ? dayEvents.map((ev) => `
        <div class="day-pill ${ev.type === 'milestone' ? 'milestone' : ''}" style="margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
          <span>◆ ${esc(ev.title)}</span>
          <button class="btn-ghost-sm" data-del-ev="${ev.id}">✕</button>
        </div>`).join('')
    : '<p class="section-sub">No events scheduled.</p>';

  evBox.querySelectorAll('[data-del-ev]').forEach((b) => (b.onclick = () => {
    state.events = state.events.filter((e) => e.id !== b.dataset.delEv);
    saveState(); renderDayView();
  }));
}
$('backToTodayBtn').onclick = () => { selectedDateISO = TODAY_ISO; renderDayView(); };

// --- Month View ---
function renderMonthView() {
  const first = new Date(viewYear, viewMonth, 1);
  $('monthViewTitle').textContent = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const grid = $('monthGrid');
  grid.innerHTML = '';

  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevDays = new Date(viewYear, viewMonth, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const isOther = i < startOffset || i >= startOffset + daysInMonth;
    const cellDate = i < startOffset
      ? new Date(viewYear, viewMonth - 1, prevDays - startOffset + i + 1)
      : new Date(viewYear, viewMonth, i - startOffset + 1);

    const iso = toISO(cellDate);
    const isToday = iso === TODAY_ISO;
    const items = [
      ...state.events.filter((e) => e.date === iso).map((e) => `<div class="day-pill ${e.type === 'milestone' ? 'milestone' : ''}">◆ ${esc(e.title)}</div>`),
      ...(state.dailyTasks[iso] || []).map((t) => `<div class="day-pill daily3">${t.done ? '✓' : '•'} ${esc(t.title)}</div>`)
    ].join('');

    const cell = document.createElement('div');
    cell.className = `day-cell ${isOther ? 'other-month' : ''} ${isToday ? 'is-today' : ''}`;
    cell.innerHTML = `
      <div class="day-cell-top">
        <div class="day-num-group">
          <span class="day-num">${cellDate.getDate()}</span>
          <span class="day-weekday-mobile">${cellDate.toLocaleDateString('en-US', { weekday: 'short' })}</span>
          ${isToday ? '<span class="today-badge">Today</span>' : ''}
        </div>
      </div>
      <div class="day-items">${items}</div>`;
    cell.onclick = () => { selectedDateISO = iso; viewYear = cellDate.getFullYear(); viewMonth = cellDate.getMonth(); switchView('day'); };
    grid.appendChild(cell);
  }
}
$('prevMonthBtn').onclick = () => { if (--viewMonth < 0) { viewMonth = 11; viewYear--; } renderMonthView(); };
$('nextMonthBtn').onclick = () => { if (++viewMonth > 11) { viewMonth = 0; viewYear++; } renderMonthView(); };

// --- Year View ---
function renderYearView() {
  $('yearViewTitle').textContent = viewYear;
  const sCard = $('seasonsCard');
  sCard.style.display = state.seasons.length ? 'block' : 'none';
  $('seasonsList').innerHTML = state.seasons.map((s) => {
    const segs = Array.from({ length: 12 }, (_, m) => `<div class="season-seg ${m + 1 >= s.startMonth && m + 1 <= s.endMonth ? 'active' : ''}"></div>`).join('');
    return `<div class="season-bar-row"><div class="season-bar-label"><span>${esc(s.title)}</span><span class="section-sub">M${s.startMonth}–M${s.endMonth}</span></div><div class="season-track">${segs}</div></div>`;
  }).join('');

  const yearGrid = $('yearGrid');
  yearGrid.innerHTML = '';
  for (let m = 0; m < 12; m++) {
    const daysCount = new Date(viewYear, m + 1, 0).getDate();
    const daysHtml = Array.from({ length: daysCount }, (_, i) => {
      const iso = toISO(new Date(viewYear, m, i + 1));
      const has = state.dailyTasks[iso]?.length || state.events.some((e) => e.date === iso);
      return `<div class="mini-day ${iso === TODAY_ISO ? 'is-today' : has ? 'has-event' : ''}">${i + 1}</div>`;
    }).join('');

    const card = document.createElement('div');
    card.className = 'mini-month';
    card.innerHTML = `<div class="mini-month-head"><span>${new Date(viewYear, m, 1).toLocaleDateString('en-US', { month: 'long' })}</span></div><div class="mini-dots">${daysHtml}</div>`;
    card.onclick = () => { viewMonth = m; switchView('month'); };
    yearGrid.appendChild(card);
  }
}

// --- Dump & Modals ---
const updateDumpBadge = () => { $('dumpCount').textContent = state.dump.length; };
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => $(b.dataset.close).classList.remove('open')));

function renderDumpList() {
  const list = $('dumpList');
  if (!state.dump.length) { list.innerHTML = '<p class="section-sub">Empty.</p>'; return; }
  list.innerHTML = state.dump.map((item) => `
    <div class="dump-item">
      <div style="font-weight:500;">${esc(item.text)}</div>
      <div class="dump-actions">
        <button class="btn-focus-sm" data-promote="${item.id}">→ Daily 3</button>
        <button class="btn-ghost-sm" data-del-dump="${item.id}">Delete</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('[data-promote]').forEach((b) => (b.onclick = () => {
    const tasks = state.dailyTasks[selectedDateISO] || [];
    if (tasks.length >= 3) return alert('Daily 3 is full.');
    const item = state.dump.find((d) => d.id === b.dataset.promote);
    if (!item) return;
    (state.dailyTasks[selectedDateISO] ||= []).push({ id: 't' + Date.now(), title: item.text, done: false });
    state.dump = state.dump.filter((d) => d.id !== item.id);
    saveState(); updateDumpBadge(); renderDumpList();
    if (currentView === 'day') renderDayView();
  }));

  list.querySelectorAll('[data-del-dump]').forEach((b) => (b.onclick = () => {
    state.dump = state.dump.filter((d) => d.id !== b.dataset.delDump);
    saveState(); updateDumpBadge(); renderDumpList();
  }));
}

$('openDumpBtn').onclick = () => { renderDumpList(); $('dumpOverlay').classList.add('open'); };
$('dumpForm').onsubmit = (e) => {
  e.preventDefault();
  const val = $('dumpInput').value.trim();
  if (!val) return;
  state.dump.unshift({ id: 'd' + Date.now(), text: val });
  $('dumpInput').value = '';
  saveState(); updateDumpBadge(); renderDumpList();
};

const openEventModal = () => { $('eventDateInput').value = selectedDateISO; $('eventModal').classList.add('open'); };
$('addEventBtn').onclick = $('monthAddEventBtn').onclick = openEventModal;
$('eventForm').onsubmit = (e) => {
  e.preventDefault();
  state.events.push({ id: 'e' + Date.now(), title: $('eventTitleInput').value.trim(), date: $('eventDateInput').value, type: $('eventTypeInput').value });
  $('eventTitleInput').value = '';
  $('eventModal').classList.remove('open');
  saveState(); switchView(currentView);
};

$('addSeasonBtn').onclick = () => $('seasonModal').classList.add('open');
$('seasonForm').onsubmit = (e) => {
  e.preventDefault();
  state.seasons.push({ id: 's' + Date.now(), title: $('seasonTitleInput').value.trim(), startMonth: +$('seasonStartInput').value, endMonth: +$('seasonEndInput').value });
  $('seasonForm').reset();
  $('seasonModal').classList.remove('open');
  saveState(); renderYearView();
};

$('openSettingsBtn').onclick = () => $('settingsModal').classList.add('open');
$('exportJsonBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  a.download = `horizon-now-${TODAY_ISO}.json`;
  a.click();
};
$('importJsonInput').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      state = normalize(JSON.parse(ev.target.result));
      saveState(); updateDumpBadge(); switchView(currentView);
      $('settingsModal').classList.remove('open');
    } catch { alert('Invalid JSON'); }
  };
  r.readAsText(file);
};
$('clearSampleBtn').onclick = () => {
  state = emptyState();
  saveState(); updateDumpBadge(); switchView(currentView);
  $('settingsModal').classList.remove('open');
};

// --- Focus Sanctuary ---
let timerSec = 1500, timerId = null;
const updateTimer = () => { $('timerDisplay').textContent = `${String(Math.floor(timerSec / 60)).padStart(2, '0')}:${String(timerSec % 60).padStart(2, '0')}`; };
function startTimer() {
  clearInterval(timerId);
  $('toggleTimerBtn').textContent = 'Pause';
  timerId = setInterval(() => (timerSec > 0 ? (--timerSec, updateTimer()) : clearInterval(timerId)), 1000);
}
function openFocus(title) {
  $('focusTaskTitle').textContent = title || 'Focus';
  timerSec = 1500; updateTimer();
  $('focusSanctuary').classList.add('open');
  startTimer();
}
$('toggleTimerBtn').onclick = () => {
  if (timerId) { clearInterval(timerId); timerId = null; $('toggleTimerBtn').textContent = 'Resume'; }
  else startTimer();
};
$('focusDumpBtn').onclick = () => {
  const t = prompt('Capture thought:');
  if (t?.trim()) { state.dump.unshift({ id: 'd' + Date.now(), text: t.trim() }); saveState(); updateDumpBadge(); }
};
$('exitFocusBtn').onclick = () => { clearInterval(timerId); timerId = null; $('focusSanctuary').classList.remove('open'); };

updateDumpBadge();
renderDayView();
