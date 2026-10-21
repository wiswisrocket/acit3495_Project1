'use strict';

// Usernames: 1-50 chars, letters, digits, dot, underscore, dash.
const USERNAME_RE = /^[A-Za-z0-9._-]{1,50}$/;

// Returns { ok: true, username, password } or { ok: false, error }.
function parseCredentials(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid request body' };
  const { username, password } = body;
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return { ok: false, error: 'invalid username' };
  }
  if (typeof password !== 'string' || password.length < 1 || password.length > 128) {
    return { ok: false, error: 'invalid password' };
  }
  return { ok: true, username, password };
}

// Tiny in-memory lockout: too many failed logins for one username in a window.
function createLoginGuard({ maxFailures = 10, windowMs = 5 * 60 * 1000, now = () => Date.now() } = {}) {
  const failures = new Map(); // username -> { count, resetAt }

  function prune() {
    if (failures.size < 1000) return;
    const t = now();
    for (const [k, v] of failures) if (v.resetAt <= t) failures.delete(k);
  }

  return {
    isLocked(username) {
      const entry = failures.get(username);
      if (!entry) return false;
      if (entry.resetAt <= now()) {
        failures.delete(username);
        return false;
      }
      return entry.count >= maxFailures;
    },
    recordFailure(username) {
      prune();
      const t = now();
      const entry = failures.get(username);
      if (!entry || entry.resetAt <= t) {
        failures.set(username, { count: 1, resetAt: t + windowMs });
      } else {
        entry.count += 1;
      }
    },
    recordSuccess(username) {
      failures.delete(username);
    },
  };
}

module.exports = { parseCredentials, createLoginGuard, USERNAME_RE };
