import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getDatabase, ref, set, onValue } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js';

const { secretVaultKey, firebaseConfig } = window.APP_CONFIG;
const STORAGE_KEY = 'horizon_now_state_v3';
const THEME_KEY = 'horizon_now_theme';

function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const todayObj = new Date();
const TODAY_ISO = toISO(todayObj);

const defaultState = {
  dailyTasks: { [TODAY_ISO]: [{ id: 't1', title: 'Finalize Q4 Launch Narrative', block: 'Morning Deep Work', done: false }] },
  events: [],
  dump: [],
  seasons: [{ id: 's1', title: 'Q4 · Flagship Product Launch', startMonth: 10, endMonth: 12, color: 'sage' }]
};

function normalizeState(raw) {
  return {
    dailyTasks: raw?.dailyTasks || {},
    events: Array.isArray(raw?.events) ? raw.events : [],
    dump: Array.isArray(raw?.dump) ? raw.dump : [],
    seasons: Array.isArray(raw?.seasons) ? raw.seasons : []
  };
}

let state = (() => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (e) {}
  return JSON.parse(JSON.stringify(defaultState));
})();

// --- Theme Switcher ---
const themeSelect = document.getElementById('themeSelect');
function applyTheme(themeName) {
  if (themeName === 'paper') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', themeName);
  if (themeSelect) themeSelect.value = themeName;
  try { window.localStorage.setItem(THEME_KEY, themeName); } catch (e) {}
}
applyTheme((() => { try { return window.localStorage.getItem(THEME_KEY) || 'paper'; } catch (e) { return 'paper'; } })());
if (themeSelect) themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));

// --- Firebase Sync ---
let dbRef = null;
const syncBadge = document.getElementById('syncStatus');

try {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  dbRef = ref(db, secretVaultKey);

  onValue(dbRef, (snapshot) => {
    syncBadge.textContent = '● Cloud Synced';
    syncBadge.classList.remove('offline');
    if (snapshot.exists()) {
      state = normalizeState(snapshot.val());
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
      updateDumpBadge();
      switchView(currentView);
    } else {
      set(dbRef, state);
    }
  }, () => {
    syncBadge.textContent = 'Check DB Rules';
    syncBadge.classList.add('offline');
  });
} catch (e) {
  syncBadge.textContent = 'Local Only';
}

function saveState() {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  if (dbRef) {
    syncBadge.textContent = 'Syncing...';
    set(dbRef, state)
      .then(() => { syncBadge.textContent = '● Cloud Synced'; syncBadge.classList.remove('offline'); })
      .catch(() => { syncBadge.textContent = 'Check DB Rules'; syncBadge.classList.add('offline'); });
  }
}

// --- Views & Navigation ---
const VIEW_ORDER = ['year', 'month', 'day'];
let currentView = 'day';
let selectedDateISO = TODAY_ISO;
let viewYear = todayObj.getFullYear();
let viewMonth = todayObj.getMonth();

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.zoom-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.toggle('active', sec.id === `view-${view}`));
  if (view === 'day') renderDayView();
  if (view === 'month') renderMonthView();
  if (view === 'year') renderYearView();
}
document.querySelectorAll('.zoom-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));

// --- Horizontal Touch Swipe (Year <> Month <> Today) ---
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchend', (e) => {
  if (e.changedTouches.length !== 1) return;
  // Ignore swipes when a drawer, modal, or Focus Sanctuary is open
  if (
    document.getElementById('dumpOverlay').classList.contains('open') ||
    document.getElementById('eventModal').classList.contains('open') ||
    document.getElementById('seasonModal').classList.contains('open') ||
    document.getElementById('settingsModal').classList.contains('open') ||
    document.getElementById('focusSanctuary').classList.contains('open')
  ) return;

  const deltaX = e.changedTouches[0].clientX - touchStartX;
  const deltaY = e.changedTouches[0].clientY - touchStartY;

  // Require intentional horizontal swipe (> 60px) and clearly horizontal vs vertical
  if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
    const idx = VIEW_ORDER.indexOf(currentView);
    if (deltaX < 0 && idx < VIEW_ORDER.length - 1) {
      // Swipe Left -> Zoom In (Year -> Month -> Today)
      switchView(VIEW_ORDER[idx + 1]);
    } else if (deltaX > 0 && idx > 0) {
      // Swipe Right -> Zoom Out (Today -> Month -> Year)
      switchView(VIEW_ORDER[idx - 1]);
    }
  }
}, { passive: true });

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function renderDayView() {
  const [y, m, d] = selectedDateISO.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const isToday = selectedDateISO === TODAY_ISO;

  document.getElementById('navDayBtn').textContent = isToday ? 'Today' : `${dateObj.toLocaleString('en-US', { month: 'short' })} ${d}`;
  document.getElementById('dayEyebrowLabel').textContent = isToday ? 'PRESENT MOMENT · MICRO COCKPIT' : 'DAY PLANNER · MICRO COCKPIT';
  document.getElementById('selectedDateFull').textContent = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
  document.getElementById('dayHeadline').textContent = isToday ? 'One step at a time. You are right here.' : `Designing ${dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} with calm intention.`;
  document.getElementById('backToTodayBtn').style.display = isToday ? 'none' : 'inline-flex';

  const activeSeasons = state.seasons.filter(s => m >= s.startMonth && m <= s.endMonth);
  document.getElementById('activeSeasonsPills').innerHTML = activeSeasons.map(s => `<span class="season-pill ${s.color === 'terra' ? 'terra' : ''}">${escapeHtml(s.title)}</span>`).join('');

  const tasks = state.dailyTasks[selectedDateISO] || [];
  document.getElementById('daily3Count').textContent = tasks.length;
  const listEl = document.getElementById('daily3List');
  listEl.innerHTML = '';

  tasks.forEach((task, idx) => {
    const div = document.createElement('div');
    div.className = `task-card ${task.done ? 'done' : ''}`;
    div.innerHTML = `
      <button class="task-check">${task.done ? '✓' : idx + 1}</button>
      <div class="task-body">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta">● ${escapeHtml(task.block || 'Deep Work')}</div>
      </div>
      <div class="task-actions">
        <button class="btn-focus-sm">Focus</button>
        <button class="btn-ghost-sm" title="Send back to Brain Dump">↩</button>
      </div>
    `;
    div.querySelector('.task-check').addEventListener('click', () => { task.done = !task.done; saveState(); renderDayView(); });
    div.querySelector('.btn-focus-sm').addEventListener('click', () => openFocus(task.title));
    div.querySelector('.btn-ghost-sm').addEventListener('click', () => {
      state.dump.unshift({ id: 'd' + Date.now(), text: task.title });
      state.dailyTasks[selectedDateISO] = tasks.filter(t => t.id !== task.id);
      saveState(); updateDumpBadge(); renderDayView();
    });
    listEl.appendChild(div);
  });

  if (tasks.length < 3) {
    const slot = document.createElement('form');
    slot.className = 'empty-slot';
    slot.innerHTML = `<input type="text" placeholder="+ Add priority #${tasks.length + 1} (max 3)..." required /><button type="submit" class="btn-focus-sm">Add</button>`;
    slot.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = slot.querySelector('input').value.trim();
      if (!val) return;
      if (!state.dailyTasks[selectedDateISO]) state.dailyTasks[selectedDateISO] = [];
      state.dailyTasks[selectedDateISO].push({ id: 't' + Date.now(), title: val, block: 'Morning Deep Work', done: false });
      saveState(); renderDayView();
    });
    listEl.appendChild(slot);
  }

  const dayEvents = state.events.filter(ev => ev.date === selectedDateISO);
  const evContainer = document.getElementById('dayEventsContainer');
  evContainer.innerHTML = dayEvents.map(ev => `
    <div class="day-pill ${ev.type === 'milestone' ? 'milestone' : ''}" style="margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
      <span>◆ ${escapeHtml(ev.title)}</span>
      <button class="btn-ghost-sm" data-del-ev="${ev.id}">✕</button>
    </div>
  `).join('');
  evContainer.querySelectorAll('[data-del-ev]').forEach(btn => btn.addEventListener('click', () => {
    state.events = state.events.filter(e => e.id !== btn.dataset.delEv);
    saveState(); renderDayView();
  }));
}

document.getElementById('backToTodayBtn').addEventListener('click', () => { selectedDateISO = TODAY_ISO; renderDayView(); });

function renderMonthView() {
  const firstDay = new Date(viewYear, viewMonth, 1);
  document.getElementById('monthViewTitle').textContent = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const grid = document.getElementById('monthGrid');
  grid.innerHTML = '';

  let startWeekday = firstDay.getDay() - 1;
  if (startWeekday < 0) startWeekday = 6;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    let cellDate, isOtherMonth = false;
    if (i < startWeekday) { cellDate = new Date(viewYear, viewMonth - 1, prevMonthDays - startWeekday + i + 1); isOtherMonth = true; }
    else if (i >= startWeekday + daysInMonth) { cellDate = new Date(viewYear, viewMonth + 1, i - (startWeekday + daysInMonth) + 1); isOtherMonth = true; }
    else { cellDate = new Date(viewYear, viewMonth, i - startWeekday + 1); }

    const iso = toISO(cellDate);
    const isToday = iso === TODAY_ISO;
    const dayTasks = state.dailyTasks[iso] || [];
    const dayEvents = state.events.filter(e => e.date === iso);

    const cell = document.createElement('div');
    cell.className = `day-cell ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'is-today' : ''}`;
    const weekdayShort = cellDate.toLocaleDateString('en-US', { weekday: 'short' });

    let itemsHtml = '';
    dayEvents.forEach(ev => { itemsHtml += `<div class="day-pill ${ev.type === 'milestone' ? 'milestone' : ''}">◆ ${escapeHtml(ev.title)}</div>`; });
    dayTasks.forEach(t => { itemsHtml += `<div class="day-pill daily3">${t.done ? '✓' : '•'} ${escapeHtml(t.title)}</div>`; });

    cell.innerHTML = `
      <div class="day-cell-top">
        <div class="day-num-group">
          <span class="day-num">${cellDate.getDate()}</span>
          <span class="day-weekday-mobile">${weekdayShort}</span>
          ${isToday ? '<span class="today-badge">Today</span>' : ''}
        </div>
        <span class="day-open-cue">Open →</span>
      </div>
      <div class="day-items">${itemsHtml}</div>
    `;
    cell.addEventListener('click', () => {
      selectedDateISO = iso; viewYear = cellDate.getFullYear(); viewMonth = cellDate.getMonth(); switchView('day');
    });
    grid.appendChild(cell);
  }
}

document.getElementById('prevMonthBtn').addEventListener('click', () => { viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } renderMonthView(); });
document.getElementById('nextMonthBtn').addEventListener('click', () => { viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } renderMonthView(); });

function renderYearView() {
  document.getElementById('yearViewTitle').textContent = viewYear;
  document.getElementById('seasonsList').innerHTML = state.seasons.map(s => {
    let segs = '';
    for (let m = 1; m <= 12; m++) segs += `<div class="season-seg ${m >= s.startMonth && m <= s.endMonth ? 'active ' + s.color : ''}"></div>`;
    return `<div class="season-bar-row"><div class="season-bar-label"><span>${escapeHtml(s.title)}</span><span style="color:var(--ink-muted);font-size:0.78rem;">M${s.startMonth} – M${s.endMonth}</span></div><div class="season-track">${segs}</div></div>`;
  }).join('');

  const yearGrid = document.getElementById('yearGrid');
  yearGrid.innerHTML = '';
  for (let m = 0; m < 12; m++) {
    const mDate = new Date(viewYear, m, 1);
    const daysCount = new Date(viewYear, m + 1, 0).getDate();
    let daysHtml = '';
    for (let d = 1; d <= daysCount; d++) {
      const iso = toISO(new Date(viewYear, m, d));
      const hasItem = (state.dailyTasks[iso]?.length > 0) || state.events.some(e => e.date === iso);
      daysHtml += `<div class="mini-day ${iso === TODAY_ISO ? 'is-today' : (hasItem ? 'has-event' : '')}">${d}</div>`;
    }
    const card = document.createElement('div');
    card.className = 'mini-month';
    card.innerHTML = `<div class="mini-month-head"><span>${mDate.toLocaleDateString('en-US', { month: 'long' })}</span><span style="font-size:0.78rem;color:var(--ink-muted);">Zoom →</span></div><div class="mini-dots">${daysHtml}</div>`;
    card.addEventListener('click', () => { viewMonth = m; switchView('month'); });
    yearGrid.appendChild(card);
  }
}

function updateDumpBadge() { document.getElementById('dumpCount').textContent = state.dump.length; }

function renderDumpList() {
  const list = document.getElementById('dumpList');
  if (state.dump.length === 0) { list.innerHTML = '<p class="section-sub">Your mind is clear. Nothing waiting here.</p>'; return; }
  list.innerHTML = state.dump.map(item => `
    <div class="dump-item">
      <div style="font-weight:500;">${escapeHtml(item.text)}</div>
      <div class="dump-actions">
        <button class="btn-focus-sm" data-promote="${item.id}">→ Move to Selected Day</button>
        <button class="btn-ghost-sm" data-del-dump="${item.id}">Delete</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-promote]').forEach(btn => btn.addEventListener('click', () => {
    const currentTasks = state.dailyTasks[selectedDateISO] || [];
    if (currentTasks.length >= 3) { alert('The Daily 3 is full for this day. Complete or release one slot first.'); return; }
    const item = state.dump.find(d => d.id === btn.dataset.promote);
    if (!item) return;
    if (!state.dailyTasks[selectedDateISO]) state.dailyTasks[selectedDateISO] = [];
    state.dailyTasks[selectedDateISO].push({ id: 't' + Date.now(), title: item.text, block: 'Morning Deep Work', done: false });
    state.dump = state.dump.filter(d => d.id !== item.id);
    saveState(); updateDumpBadge(); renderDumpList();
    if (currentView === 'day') renderDayView();
  }));

  list.querySelectorAll('[data-del-dump]').forEach(btn => btn.addEventListener('click', () => {
    state.dump = state.dump.filter(d => d.id !== btn.dataset.delDump);
    saveState(); updateDumpBadge(); renderDumpList();
  }));
}

document.getElementById('openDumpBtn').addEventListener('click', () => { renderDumpList(); document.getElementById('dumpOverlay').classList.add('open'); });
document.getElementById('closeDumpBtn').addEventListener('click', () => document.getElementById('dumpOverlay').classList.remove('open'));
document.getElementById('dumpForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('dumpInput');
  if (!input.value.trim()) return;
  state.dump.unshift({ id: 'd' + Date.now(), text: input.value.trim() });
  input.value = '';
  saveState(); updateDumpBadge(); renderDumpList();
});

function openEventModal() { document.getElementById('eventDateInput').value = selectedDateISO; document.getElementById('eventModal').classList.add('open'); }
document.getElementById('addEventBtn').addEventListener('click', openEventModal);
document.getElementById('monthAddEventBtn').addEventListener('click', openEventModal);
document.getElementById('closeEventModal').addEventListener('click', () => document.getElementById('eventModal').classList.remove('open'));
document.getElementById('eventForm').addEventListener('submit', (e) => {
  e.preventDefault();
  state.events.push({ id: 'e' + Date.now(), title: document.getElementById('eventTitleInput').value.trim(), date: document.getElementById('eventDateInput').value, type: document.getElementById('eventTypeInput').value });
  document.getElementById('eventTitleInput').value = '';
  document.getElementById('eventModal').classList.remove('open');
  saveState(); switchView(currentView);
});

document.getElementById('addSeasonBtn').addEventListener('click', () => document.getElementById('seasonModal').classList.add('open'));
document.getElementById('closeSeasonModal').addEventListener('click', () => document.getElementById('seasonModal').classList.remove('open'));
document.getElementById('seasonForm').addEventListener('submit', (e) => {
  e.preventDefault();
  state.seasons.push({ id: 's' + Date.now(), title: document.getElementById('seasonTitleInput').value.trim(), startMonth: Number(document.getElementById('seasonStartInput').value), endMonth: Number(document.getElementById('seasonEndInput').value), color: 'sage' });
  document.getElementById('seasonTitleInput').value = '';
  document.getElementById('seasonModal').classList.remove('open');
  saveState(); renderYearView();
});

document.getElementById('openSettingsBtn').addEventListener('click', () => document.getElementById('settingsModal').classList.add('open'));
document.getElementById('closeSettingsModal').addEventListener('click', () => document.getElementById('settingsModal').classList.remove('open'));
document.getElementById('exportJsonBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `horizon-now-backup-${TODAY_ISO}.json`; a.click();
});
document.getElementById('importJsonInput').addEventListener('change', (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try { state = normalizeState(JSON.parse(ev.target.result)); saveState(); updateDumpBadge(); switchView(currentView); document.getElementById('settingsModal').classList.remove('open'); }
    catch (err) { alert('Invalid backup JSON file.'); }
  };
  reader.readAsText(file);
});
document.getElementById('clearSampleBtn').addEventListener('click', () => {
  state = { dailyTasks: {}, events: [], dump: [], seasons: [] };
  saveState(); updateDumpBadge(); switchView(currentView); document.getElementById('settingsModal').classList.remove('open');
});

let timerSeconds = 25 * 60, timerInterval = null, timerRunning = false;
function updateTimerUI() {
  document.getElementById('timerDisplay').textContent = `${String(Math.floor(timerSeconds / 60)).padStart(2, '0')}:${String(timerSeconds % 60).padStart(2, '0')}`;
}
function openFocus(taskTitle) {
  const tasks = state.dailyTasks[selectedDateISO] || [];
  document.getElementById('focusTaskTitle').textContent = taskTitle || tasks.find(t => !t.done)?.title || 'Present-Moment Deep Work';
  timerSeconds = 25 * 60; updateTimerUI(); document.getElementById('focusSanctuary').classList.add('open'); startTimer();
}
function startTimer() {
  clearInterval(timerInterval); timerRunning = true; document.getElementById('toggleTimerBtn').textContent = 'Pause Timer';
  timerInterval = setInterval(() => { if (timerSeconds > 0) { timerSeconds--; updateTimerUI(); } else { clearInterval(timerInterval); timerRunning = false; } }, 1000);
}
document.getElementById('enterFocusBtn').addEventListener('click', () => openFocus());
document.getElementById('toggleTimerBtn').addEventListener('click', () => {
  if (timerRunning) { clearInterval(timerInterval); timerRunning = false; document.getElementById('toggleTimerBtn').textContent = 'Resume Timer'; }
  else startTimer();
});
document.getElementById('focusDumpBtn').addEventListener('click', () => {
  const thought = prompt('Capture stray thought to Brain Dump:');
  if (thought && thought.trim()) { state.dump.unshift({ id: 'd' + Date.now(), text: thought.trim() }); saveState(); updateDumpBadge(); }
});
document.getElementById('exitFocusBtn').addEventListener('click', () => { clearInterval(timerInterval); timerRunning = false; document.getElementById('focusSanctuary').classList.remove('open'); });

updateDumpBadge();
renderDayView();
