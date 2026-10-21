'use strict';

const $ = (id) => document.getElementById(id);
const loginView = $('login-view');
const dataView = $('data-view');
const message = $('message');

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
  dataView.hidden = true;
  loginView.hidden = false;
}

async function showData(username) {
  loginView.hidden = true;
  dataView.hidden = false;
  $('who').textContent = username;
  await loadRecent();
}

async function loadRecent() {
  const { status, body } = await api('/api/data/recent');
  if (status === 401) return showLogin();
  const tbody = $('recent');
  tbody.replaceChildren();
  if (status !== 200) return say(body.error || 'could not load entries', true);
  for (const row of body) {
    const tr = document.createElement('tr');
    for (const text of [row.id, row.value, new Date(row.created_at).toLocaleString()]) {
      const td = document.createElement('td');
      td.textContent = String(text);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
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
  showData(body.username);
});

$('data-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = new FormData(e.target).get('value');
  const { status, body } = await api('/api/data', { method: 'POST', body: { value } });
  if (status === 401) {
    say('Session expired, please log in again.', true);
    return showLogin();
  }
  if (status !== 201) return say(body.error || 'could not save', true);
  e.target.reset();
  say(`Saved ${body.value}`);
  loadRecent();
});

$('logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  say('');
  showLogin();
});

(async () => {
  const { status, body } = await api('/api/me');
  if (status === 200) showData(body.username);
  else showLogin();
})();
