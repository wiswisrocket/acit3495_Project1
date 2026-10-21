'use strict';

const $ = (id) => document.getElementById(id);
const loginView = $('login-view');
const resultsView = $('results-view');
const message = $('message');
let refreshTimer = null;

function say(text, isError = false) {
  message.textContent = text;
  message.className = isError ? 'error' : 'ok';
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function showLogin() {
  clearInterval(refreshTimer);
  resultsView.hidden = true;
  loginView.hidden = false;
}

function fmt(n) {
  return n === null || n === undefined ? '-' : String(n);
}

function fillRow(tbody, cells) {
  const tr = document.createElement('tr');
  for (const text of cells) {
    const td = document.createElement('td');
    td.textContent = fmt(text);
    tr.appendChild(td);
  }
  tbody.appendChild(tr);
}

async function loadStats() {
  const { status, body } = await api('/api/stats');
  if (status === 401) {
    say('Session expired, please log in again.', true);
    return showLogin();
  }
  if (status !== 200) return say(body.error || 'could not load results', true);
  say('');

  const overall = $('overall');
  overall.replaceChildren();
  if (body.overall) fillRow(overall, [body.overall.count, body.overall.min, body.overall.max, body.overall.avg]);
  else fillRow(overall, ['No results yet - waiting for the analytics service', '', '', '']);

  const users = $('users');
  users.replaceChildren();
  for (const u of body.users) fillRow(users, [u.username, u.count, u.min, u.max, u.avg]);

  const when = body.overall && body.overall.updated_at ? new Date(body.overall.updated_at).toLocaleString() : 'never';
  $('updated').textContent = `Last computed: ${when}`;
}

function showResults(username) {
  loginView.hidden = true;
  resultsView.hidden = false;
  $('who').textContent = username;
  loadStats();
  clearInterval(refreshTimer);
  refreshTimer = setInterval(loadStats, 10000);
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const { status, body } = await api('/api/login', {
    method: 'POST',
    body: { username: form.get('username'), password: form.get('password') },
  });
  if (status !== 200) return say(body.error || 'login failed', true);
  e.target.reset();
  say('');
  showResults(body.username);
});

$('logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  say('');
  showLogin();
});

(async () => {
  const { status, body } = await api('/api/me');
  if (status === 200) showResults(body.username);
  else showLogin();
})();
