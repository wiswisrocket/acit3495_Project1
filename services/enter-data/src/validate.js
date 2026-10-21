'use strict';

// Column is DECIMAL(12,4): at most 8 digits before the point, 4 after.
const MAX_ABS = 1e8;
const NUMERIC_STRING_RE = /^-?\d+(\.\d{1,4})?$/;

// Accepts a number or a plain numeric string. Returns { ok: true, value } or { ok: false, error }.
function parseValue(input) {
  let n = input;
  if (typeof n === 'string') {
    const trimmed = n.trim();
    if (!NUMERIC_STRING_RE.test(trimmed)) return { ok: false, error: 'value must be a number' };
    n = Number(trimmed);
  }
  if (typeof n !== 'number' || !Number.isFinite(n)) return { ok: false, error: 'value must be a number' };
  if (Math.abs(n) >= MAX_ABS) return { ok: false, error: 'value out of range' };
  return { ok: true, value: Math.round(n * 10000) / 10000 };
}

module.exports = { parseValue, MAX_ABS };
