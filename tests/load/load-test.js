// Load test for POST /api/data on Enter Data. Needs Node 18+ (built-in fetch); nothing to install.
// Usage (PowerShell):
//   $env:USERNAME_="<SEED_USERNAME>"; $env:PASSWORD_="<SEED_PASSWORD>"
//   node tests/load/load-test.js 500 20      # total requests, concurrency
// Bash:
//   USERNAME_=<user> PASSWORD_=<pass> node tests/load/load-test.js 500 20
// Writes real rows to MySQL. Credentials come from env vars; never commit them.
const BASE = process.env.BASE_URL || 'http://localhost:8081';
const total = Number(process.argv[2] || 500);
const conc = Number(process.argv[3] || 20);

async function main() {
  const login = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.USERNAME_, password: process.env.PASSWORD_ }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const cookie = login.headers.getSetCookie()[0].split(';')[0]; // never printed

  let sent = 0, ok = 0, errors = 0;
  const statuses = {};
  const start = performance.now();

  async function worker() {
    while (sent < total) {
      sent++;
      try {
        const r = await fetch(`${BASE}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie },
          body: JSON.stringify({ value: Math.round(Math.random() * 1000) }),
        });
        statuses[r.status] = (statuses[r.status] || 0) + 1;
        r.status === 201 ? ok++ : errors++;
        await r.arrayBuffer();
      } catch {
        errors++;
      }
    }
  }
  await Promise.all(Array.from({ length: conc }, worker));
  const secs = (performance.now() - start) / 1000;
  console.log({ total, conc, seconds: secs.toFixed(2), rps: (total / secs).toFixed(1), ok, errors, statuses });
}
main();
