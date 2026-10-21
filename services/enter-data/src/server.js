'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const mysql = require('mysql2/promise');
const { parseValue } = require('./validate');
const { createAuthClient, requireAuth, cookieOptions, COOKIE_NAME } = require('./auth');

function log(level, msg, extra = {}) {
  // One JSON object per line. Never pass passwords, tokens or secrets in `extra`.
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, service: 'enter-data', msg, ...extra }));
}

const REQUIRED = ['AUTH_URL', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    log('error', `missing required environment variable ${key}`);
    process.exit(1);
  }
}

const PORT = Number(process.env.PORT || 3000);
const SECURE_COOKIE = process.env.COOKIE_SECURE === 'true';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 5000,
});

const authClient = createAuthClient(process.env.AUTH_URL);
const protect = requireAuth(authClient);

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});
app.use(express.json({ limit: '2kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    log('error', 'health check failed: database unreachable', { code: err.code });
    res.status(503).json({ status: 'unavailable' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const result = await authClient.login(username, password);
  if (result.status === 200 && result.body.token) {
    res.cookie(COOKIE_NAME, result.body.token, cookieOptions(SECURE_COOKIE));
    return res.json({ username: result.body.username });
  }
  if (result.status === 400) return res.status(400).json({ error: result.body.error || 'invalid input' });
  if (result.status === 401) return res.status(401).json({ error: 'invalid credentials' });
  if (result.status === 429) return res.status(429).json({ error: 'too many failed attempts, try again later' });
  log('error', 'login failed: authentication service problem', { authStatus: result.status });
  return res.status(503).json({ error: 'authentication service unavailable' });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', protect, (req, res) => {
  res.json({ username: req.user });
});

app.post('/api/data', protect, async (req, res) => {
  const parsed = parseValue(req.body && req.body.value);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  try {
    const [result] = await pool.execute('INSERT INTO measurements (username, value) VALUES (?, ?)', [
      req.user,
      parsed.value,
    ]);
    log('info', 'measurement stored', { username: req.user, id: result.insertId });
    return res.status(201).json({ id: result.insertId, value: parsed.value });
  } catch (err) {
    log('error', 'insert failed', { code: err.code });
    return res.status(503).json({ error: 'database unavailable, please retry' });
  }
});

app.get('/api/data/recent', protect, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, value, created_at FROM measurements WHERE username = ? ORDER BY id DESC LIMIT 10',
      [req.user],
    );
    res.json(rows.map((r) => ({ id: r.id, value: Number(r.value), created_at: r.created_at })));
  } catch (err) {
    log('error', 'recent query failed', { code: err.code });
    res.status(503).json({ error: 'database unavailable, please retry' });
  }
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({ error: 'invalid request body' });
  }
  log('error', 'unhandled error', { message: err.message });
  return res.status(500).json({ error: 'internal error' });
});

const server = app.listen(PORT, () => log('info', 'enter-data listening', { port: PORT }));

function shutdown(signal) {
  log('info', 'shutting down', { signal });
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
