'use strict';

// Helpers for talking to the Authentication Service and protecting routes.

const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE_MS = 60 * 60 * 1000;

function createAuthClient(authUrl, timeoutMs = 3000) {
  return {
    // Returns { status, body }. status 0 means the auth service could not be reached.
    async login(username, password) {
      try {
        const res = await fetch(`${authUrl}/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        return { status: res.status, body: await res.json().catch(() => ({})) };
      } catch (err) {
        return { status: 0, body: {} };
      }
    },
    async verify(token) {
      try {
        const res = await fetch(`${authUrl}/verify`, {
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status === 401) return { status: 401 };
        if (!res.ok) return { status: 0 };
        const body = await res.json();
        return { status: 200, username: body.username };
      } catch (err) {
        return { status: 0 };
      }
    },
  };
}

function requireAuth(authClient) {
  return async (req, res, next) => {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token || typeof token !== 'string') return res.status(401).json({ error: 'not logged in' });
    const result = await authClient.verify(token);
    if (result.status === 401) return res.status(401).json({ error: 'not logged in' });
    if (result.status !== 200) return res.status(503).json({ error: 'authentication service unavailable' });
    req.user = result.username;
    return next();
  };
}

function cookieOptions(secure) {
  return { httpOnly: true, sameSite: 'strict', secure, maxAge: COOKIE_MAX_AGE_MS, path: '/' };
}

module.exports = { createAuthClient, requireAuth, cookieOptions, COOKIE_NAME };
