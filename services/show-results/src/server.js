'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { MongoClient } = require('mongodb');
const { createAuthClient, requireAuth, cookieOptions, COOKIE_NAME } = require('./auth');
const { shapeStats } = require('./format');

function log(level, msg, extra = {}) {
  // One JSON object per line. Never pass passwords, tokens or secrets in `extra`.
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, service: 'show-results', msg, ...extra }));
}

const REQUIRED = ['AUTH_URL', 'MONGO_HOST', 'MONGO_DB', 'MONGO_USER', 'MONGO_PASSWORD'];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    log('error', `missing required environment variable ${key}`);
    process.exit(1);
  }
}

const PORT = Number(process.env.PORT || 3000);
const SECURE_COOKIE = process.env.COOKIE_SECURE === 'true';
const DB_NAME = process.env.MONGO_DB;

// Credentials go in options (not the URL) so special characters never need escaping.
const mongo = new MongoClient(`mongodb://${process.env.MONGO_HOST}:27017`, {
  auth: { username: process.env.MONGO_USER, password: process.env.MONGO_PASSWORD },
  authSource: DB_NAME,
  serverSelectionTimeoutMS: 3000,
  connectTimeoutMS: 3000,
});
const db = () => mongo.db(DB_NAME);

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
    await db().command({ ping: 1 });
    res.json({ status: 'ok' });
  } catch (err) {
    log('error', 'health check failed: mongodb unreachable', { name: err.name });
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

app.get('/api/stats', protect, async (req, res) => {
  try {
    const docs = await db().collection('stats').find({}).limit(500).toArray();
    res.json(shapeStats(docs));
  } catch (err) {
    log('error', 'stats query failed', { name: err.name });
    res.status(503).json({ error: 'analytics database unavailable, please retry' });
  }
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({ error: 'invalid request body' });
  }
  log('error', 'unhandled error', { message: err.message });
  return res.status(500).json({ error: 'internal error' });
});

// MongoClient connects lazily and reconnects on its own, so the server can start immediately.
const server = app.listen(PORT, () => log('info', 'show-results listening', { port: PORT }));

function shutdown(signal) {
  log('info', 'shutting down', { signal });
  server.close(() => mongo.close().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
