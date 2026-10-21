'use strict';

const jwt = require('jsonwebtoken');

function signToken(username, secret, expiresIn = '1h') {
  return jwt.sign({ sub: username }, secret, { algorithm: 'HS256', expiresIn });
}

// Returns { ok: true, username } or { ok: false }. Never throws.
function verifyToken(token, secret) {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return { ok: false };
    return { ok: true, username: payload.sub };
  } catch (err) {
    return { ok: false };
  }
}

module.exports = { signToken, verifyToken };
