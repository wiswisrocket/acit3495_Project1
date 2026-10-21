'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const { signToken, verifyToken } = require('./tokens');
const { parseCredentials, createLoginGuard } = require('./validate');

function log(level, msg, extra = {}) {
  // One JSON object per line. Never pass passwords, tokens or secrets in `extra`.
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, service: 'auth', msg, ...extra }));
}

const REQUIRED = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    log('error', `missing required environment variable ${key}`);
    process.exit(1);
  }
}

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  connectTimeout: 5000,
});

const guard = createLoginGuard();
// Compared against when a username does not exist, so response time does not reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    log('error', 'health check failed: database unreachable', { code: err.code });
    res.status(503).json({ status: 'unavailable' });
  }
});

app.post('/login', async (req, res) => {
  const parsed = parseCredentials(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const { username, password } = parsed;

  if (guard.isLocked(username)) {
    log('warn', 'login blocked: too many failures', { username });
    return res.status(429).json({ error: 'too many failed attempts, try again later' });
  }

  try {
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE username = ?', [username]);
    const hash = rows.length ? rows[0].password_hash : DUMMY_HASH;
    const match = await bcrypt.compare(password, hash);

    if (!rows.length || !match) {
      guard.recordFailure(username);
      log('warn', 'login failed', { username });
      return res.status(401).json({ error: 'invalid credentials' });
    }

    guard.recordSuccess(username);
    log('info', 'login ok', { username });
    return res.json({ token: signToken(username, JWT_SECRET), username });
  } catch (err) {
    log('error', 'login error', { code: err.code });
    return res.status(503).json({ error: 'service unavailable' });
  }
});

// Other services call this with "Authorization: Bearer <token>".
app.get('/verify', (req, res) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const result = token ? verifyToken(token, JWT_SECRET) : { ok: false };
  if (!result.ok) return res.status(401).json({ error: 'invalid or expired token' });
  return res.json({ username: result.username });
});

// Handles malformed JSON and anything unexpected without leaking details.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({ error: 'invalid request body' });
  }
  log('error', 'unhandled error', { message: err.message });
  return res.status(500).json({ error: 'internal error' });
});

async function seedUser() {
  const username = process.env.SEED_USERNAME;
  const password = process.env.SEED_PASSWORD;
  if (!username || !password) {
    log('info', 'no seed user configured');
    return;
  }
  const parsed = parseCredentials({ username, password });
  if (!parsed.ok) {
    log('error', 'seed user is invalid, skipping', { reason: parsed.error });
    return;
  }
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      const hash = await bcrypt.hash(password, 10);
      const [result] = await pool.execute(
        'INSERT IGNORE INTO users (username, password_hash) VALUES (?, ?)',
        [username, hash],
      );
      log('info', result.affectedRows ? 'seed user created' : 'seed user already exists', { username });
      return;
    } catch (err) {
      log('warn', 'seed user attempt failed', { attempt, code: err.code });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  log('error', 'could not create seed user');
}

const server = app.listen(PORT, () => {
  log('info', 'auth service listening', { port: PORT });
  seedUser();
});

function shutdown(signal) {
  log('info', 'shutting down', { signal });
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
