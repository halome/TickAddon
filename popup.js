import { TickClient } from './api.js';

const $ = (id) => document.getElementById(id);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const state = {
  auth: null,
  client: null,
  view: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selected: new Set(),
  existing: {}, // 'YYYY-MM-DD' -> total hours already logged
  projects: [],
  loadToken: 0,
};

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
const fmtHours = (h) => String(Math.round(h * 100) / 100);

function showError(msg) {
  $('error').textContent = msg || '';
}

// ---------- calendar ----------

function renderCalendar() {
  const y = state.view.getFullYear();
  const m = state.view.getMonth();
  $('month-label').textContent = `${MONTHS[m]} ${y}`;

  const grid = $('days');
  grid.replaceChildren();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  for (let i = 0; i < offset; i++) grid.append(document.createElement('span'));

  const today = iso(new Date());
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const key = iso(date);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day';
    btn.classList.toggle('weekend', isWeekend(date));
    btn.classList.toggle('selected', state.selected.has(key));
    btn.classList.toggle('today', key === today);

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = d;
    btn.append(num);

    const hours = state.existing[key];
    if (hours) {
      btn.classList.add('has-hours');
      const h = document.createElement('span');
      h.className = 'hours';
      h.textContent = `${fmtHours(hours)}h`;
      btn.append(h);
      btn.title = `Already logged: ${fmtHours(hours)} h`;
    }

    btn.addEventListener('click', () => {
      state.selected.has(key) ? state.selected.delete(key) : state.selected.add(key);
      renderCalendar();
      updateSummary();
    });
    grid.append(btn);
  }
}

function updateSummary() {
  const n = state.selected.size;
  const hours = parseFloat($('hours').value) || 0;
  $('sel-count').textContent = n ? `selected: ${n}` : '';
  $('submit').textContent = n ? `Submit ${n} ${n === 1 ? 'entry' : 'entries'} (${fmtHours(n * hours)} h)` : 'Select days in the calendar';
  $('submit').disabled = !n;
}

async function loadExisting() {
  state.existing = {};
  renderCalendar();
  if (!state.auth.userId) return;

  const token = ++state.loadToken;
  const y = state.view.getFullYear();
  const m = state.view.getMonth();
  try {
    const entries = await state.client.entries({
      startDate: iso(new Date(y, m, 1)),
      endDate: iso(new Date(y, m + 1, 0)),
      userId: state.auth.userId,
    });
    if (token !== state.loadToken) return;
    const sums = {};
    entries.forEach((e) => (sums[e.date] = (sums[e.date] || 0) + Number(e.hours)));
    state.existing = sums;
    renderCalendar();
  } catch (e) {
    console.warn('Failed to load existing entries', e);
  }
}

function changeMonth(delta) {
  state.view = new Date(state.view.getFullYear(), state.view.getMonth() + delta, 1);
  loadExisting();
}

function selectWorkdays() {
  const y = state.view.getFullYear();
  const m = state.view.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    if (!isWeekend(date)) state.selected.add(iso(date));
  }
  renderCalendar();
  updateSummary();
}

// ---------- projects and tasks ----------

function renderProjects(selectedId) {
  const filter = $('project-filter').value.trim().toLowerCase();
  const select = $('project');
  const current = selectedId ?? select.value;
  const visible = state.projects.filter((p) => !filter || p.name.toLowerCase().includes(filter) || String(p.id) === current);
  select.replaceChildren(...visible.map((p) => new Option(p.name, p.id)));
  if (visible.some((p) => String(p.id) === String(current))) select.value = current;
}

async function loadTasks(selectedTaskId) {
  const select = $('task');
  select.replaceChildren(new Option('Loading…', ''));
  const projectId = $('project').value;
  if (!projectId) return select.replaceChildren();
  try {
    const tasks = await state.client.tasks(projectId);
    tasks.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name));
    select.replaceChildren(...tasks.map((t) => new Option(t.name, t.id)));
    if (selectedTaskId && tasks.some((t) => String(t.id) === String(selectedTaskId))) select.value = selectedTaskId;
  } catch (e) {
    select.replaceChildren();
    showError(`Failed to load tasks: ${e.message}`);
  }
}

async function loadProjects(last) {
  const select = $('project');
  select.replaceChildren(new Option('Loading…', ''));
  try {
    state.projects = (await state.client.projects()).sort((a, b) => a.name.localeCompare(b.name));
    renderProjects(last.projectId);
    await loadTasks(last.taskId);
  } catch (e) {
    select.replaceChildren();
    showError(`Failed to load projects: ${e.message}`);
  }
}

// ---------- submitting ----------

async function submit() {
  showError('');
  const dates = [...state.selected].sort();
  const taskId = Number($('task').value);
  const hours = parseFloat($('hours').value);
  const notes = $('notes').value.trim();

  if (!dates.length) return showError('Select at least one day.');
  if (!taskId) return showError('Select a project and a task.');
  if (!(hours > 0 && hours <= 24)) return showError('Enter a valid number of hours.');

  const overlapping = dates.filter((d) => state.existing[d]);
  if (overlapping.length && !confirm(`${overlapping.length} of the selected days already have hours logged:\n${overlapping.join(', ')}\n\nAdd anyway?`)) return;

  await chrome.storage.local.set({ last: { projectId: $('project').value, taskId, hours, notes } });
  $('submit').disabled = true;
  await chrome.runtime.sendMessage({ type: 'submit', payload: { dates, taskId, hours, notes } });
}

function renderJob(job) {
  if (!job) return;
  const list = $('results');
  list.replaceChildren(
    ...job.results.map((r) => {
      const li = document.createElement('li');
      li.className = r.ok ? 'ok' : 'fail';
      li.textContent = r.ok ? r.date : `${r.date}: ${r.error}`;
      return li;
    }),
  );

  if (job.running) {
    $('submit').disabled = true;
    $('submit').textContent = `Submitting… ${job.results.length}/${job.total}`;
    return;
  }

  // When done, deselect the days that succeeded; failed ones stay selected for a retry.
  job.results.filter((r) => r.ok).forEach((r) => state.selected.delete(r.date));
  updateSummary();
}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'session' && changes.job) {
    const job = changes.job.newValue;
    renderJob(job);
    if (job && !job.running) {
      state.auth = (await chrome.storage.local.get('auth')).auth; // userId may have been added
      loadExisting();
    }
  }
});

// ---------- startup ----------

async function init() {
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  const openOptions = () => chrome.runtime.openOptionsPage();
  $('open-options').addEventListener('click', openOptions);
  $('go-options').addEventListener('click', openOptions);

  const { auth, last = {} } = await chrome.storage.local.get(['auth', 'last']);
  if (!auth?.apiToken) {
    $('no-auth').hidden = false;
    return;
  }
  state.auth = auth;
  state.client = new TickClient(auth);
  $('app').hidden = false;

  if (last.hours) $('hours').value = last.hours;
  if (last.notes) $('notes').value = last.notes;

  $('prev').addEventListener('click', () => changeMonth(-1));
  $('next').addEventListener('click', () => changeMonth(1));
  $('workdays').addEventListener('click', selectWorkdays);
  $('clear').addEventListener('click', () => {
    state.selected.clear();
    renderCalendar();
    updateSummary();
  });
  $('project-filter').addEventListener('input', () => {
    const before = $('project').value;
    renderProjects();
    if ($('project').value !== before) loadTasks();
  });
  $('project').addEventListener('change', () => loadTasks());
  $('hours').addEventListener('input', updateSummary);
  $('submit').addEventListener('click', submit);

  updateSummary();
  loadExisting();
  loadProjects(last);

  const { job } = await chrome.storage.session.get('job');
  if (job?.running) renderJob(job);
}

init();
