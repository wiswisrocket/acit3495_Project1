# ACIT3495_Project1

## Project Overview

The team is building the **Data Collection and Analytics System**.

| Service | Role |
| --- | --- |
| Enter Data web app | Authenticated users enter numeric data (grades, temperatures, etc.); writes to MySQL |
| Authentication Service | Validates users; protects both web apps |
| Analytics Service | Reads raw data from MySQL, computes min/max/average/count, writes results to MongoDB |
| Show Results web app | Authenticated users view the computed analytics stored in MongoDB |
| MySQL | Stores raw entered data |
| MongoDB | Stores computed analytics results |

Use at least 2 programming languages across these services (e.g. Node.js for the web apps + Python for the Analytics Service).

This system needs the same engineering depth — networking, persistence, health checks, security, resource limits, logging, and CI/CD — and that's where most of the rubric's marks actually live.

**Suggested service ownership (4 people, adjust as needed):**

| Person | Owns | Also contributes to |
| --- | --- | --- |
| A | Authentication Service | Shared Docker Compose file, network/secrets design |
| B | Enter Data web app | CI pipeline (build + test stages) |
| C | Show Results web app | CI pipeline (scan + publish stages) |
| D | Analytics Service + MySQL + MongoDB | Persistence (volumes), health checks |

Everyone reviews every PR regardless of ownership — the rubric's 25 marks for presentation/defense assume each person can explain the *whole* system, not just their own service.

## Preparation

### Repo structure

Use a monorepo so Compose and CI can see every service at once:

```
repo/
  services/
    auth/          (Dockerfile, source, tests)
    web-app-1/
    web-app-2/
    analytics/     (or file-system-service/)
  docker-compose.yml
  .dockerignore     (one per service dir, or repo-root + overrides)
  .github/workflows/ci.yml
  docs/             (architecture diagram, README, technical report)
```

### Tooling everyone installs locally

- Docker Desktop (or Docker Engine + Compose v2 — `docker compose`, not the old `docker-compose`)
- `git`, plus a GitHub account added as a collaborator on the repo
- A free container registry account (GitHub Container Registry — `ghcr.io` — is simplest since it reuses GitHub auth; Docker Hub works too) — agree on ONE registry as a team
- `docker scout` or `trivy` CLI for local vulnerability scanning before pushing

### Repo setup checklist (do this once, together)

- [ ] Create the repo (or confirm access) and add all 4 members as collaborators
- [ ] Set the default branch to `main` and add a branch protection rule: PRs required, at least 1 approval, CI must pass before merge
- [ ] Add a root `.gitignore` (node\_modules, **pycache**, .env, venv, etc.) and a root `.env.example` (no real values)
- [ ] Create a GitHub Project board or use Issues + labels to track the rubric categories as epics (Functionality, Docker/Optimization, Security, Reliability/Persistence, Performance, CI/CD, Docs)
- [ ] Agree on the registry and create a shared namespace/org there
- [ ] Decide the base images per language now (e.g. `python:3.12-slim`, `node:20-alpine`) so Dockerfiles are consistent from the start

### Ground rules for AI-generated code

AI-assisted code generation is allowed for the services, but the instructor evaluation (25 marks) requires each person to **explain and defend** the code — treat AI output as a draft, not a submission:

- Every AI-generated file gets read and understood by its owner before it's committed — you must be able to answer "why does this line exist" in the demo
- Never let AI invent secrets, API keys, or passwords “for example purposes” and commit them — use placeholders and `.env` files from the start
- Ask AI tools to follow the team's agreed folder structure, base images, and health-check/logging conventions rather than letting each service drift stylistically
- Review AI-written Dockerfiles specifically for: running as root (fix it), missing `.dockerignore`, missing multi-stage builds, and copying more than needed into the final image
- Keep a short note in each service's README on which parts were AI-assisted — useful for your own defense prep, and some instructors ask for this directly

## Workflow

### Branching

- Trunk-based, short-lived branches: `feat/analytics-mongo-writer`, `fix/auth-token-expiry`, `chore/ci-trivy-scan`
- One branch per service change where possible — keeps PRs small enough to actually review
- `main` is always the branch a fresh clone can deploy with (Deliverable #2 requires a clean-environment startup, so a broken `main` blocks everyone)

### Pull requests

- Open a PR as soon as there's something to look at, even a draft — don't sit on a branch for days
- PR description states: which service, what changed, how to test it locally, and (per the AI ground rules above) whether it was AI-assisted
- Minimum 1 approval from someone who does **not** own that service — this is also how everyone ends up able to explain the whole system for the defense
- Merge only after CI is green: lint/build → unit tests → image build → vulnerability scan

### Code review checklist (quick pass, every PR)

- [ ] No hardcoded secrets, passwords, tokens, or connection strings
- [ ] Dockerfile doesn't run as root unless there's a documented reason
- [ ] New service reads config from environment variables, not literals
- [ ] Logs don't print secrets or full request bodies
- [ ] Health check endpoint exists if this PR adds/changes a service's startup behavior

### Tracking work

- Use GitHub Issues + a Project board (columns: Backlog / In Progress / In Review / Done)
- One issue per rubric sub-requirement, not just per feature — e.g. "Add resource limits to Compose + justify them" is its own issue, separate from "Analytics Service works"
- Tag issues by rubric category (`docker`, `security`, `reliability`, `performance`, `ci-cd`, `docs`) so it's easy to see at a glance which rubric areas still need evidence

### Cadence

- Short weekly sync (15–20 min): what's blocking anyone, what's merging this week
- Book the failure-test and load-test sessions as calendar events once services are integrated — these need the whole system up and at least two people (one breaking things, one observing/recording)
- Start the README/technical report early and update it as you go, not the night before — it's much easier to write down *why* you set a resource limit or added a health check right after you did it than to reconstruct it later

## Things to Know

### Docker & images (15 marks)

- One Dockerfile per service, plus one `docker-compose.yml` for the whole system
- At least one service needs a genuine **multi-stage build** (e.g. a Node.js app: install + build in a `node` stage, copy only the output into a slim runtime stage)
- Add a `.dockerignore` per service (`node_modules`, `.git`, `.env`, `__pycache__`, test files) — smaller build context, fewer accidental secret leaks
- Build for both amd64 and arm64: `docker buildx build --platform linux/amd64,linux/arm64 ...` — test this early, not the week it's due
- Keep before/after evidence for at least one optimization (e.g. `python:3.12` → `python:3.12-slim`, or adding multi-stage): record image size (`docker images`) and build time before and after

### Networking

- Only the two web apps need a published port (`-p`/Compose `ports:`) — MySQL, MongoDB, and the Analytics Service should **not** be exposed to the host
- Put everything on a user-defined Compose network so services resolve each other by name (no hardcoded IPs) — Compose creates this automatically per project
- The Authentication Service sits in front of both web apps' protected routes; decide now whether it's a shared library/middleware both apps call, or a separate service they call over the network

### Persistence

- MySQL and MongoDB each need a named volume so data survives `docker compose down` / container recreation
- Prove it: write some data, `docker compose down` (without `-v`), `docker compose up`, show the data is still there — this is literally one of the required pieces of evidence

### Health checks & recovery

- Add a Compose `healthcheck:` for each database and each service (a simple HTTP `/health` endpoint for the web apps/Analytics Service; `mysqladmin ping` / `mongosh --eval "db.adminCommand('ping')"` for the databases)
- Use `depends_on: condition: service_healthy` so the Analytics Service doesn't start hammering MySQL before it's ready
- For the failure-test evidence: stop MySQL while the Enter Data app is running, and separately stop the Analytics Service, and document what the user sees and how the system recovers (retries, error message, auto-restart via `restart: unless-stopped`, etc.)

### Security (15 marks)

- No real secrets in the repo, ever — use a `.env` file (gitignored) + `.env.example` with placeholder values, or Docker/Compose secrets
- Run containers as a non-root user where the base image allows it (most official images support `USER` in the Dockerfile)
- Authentication Service must actually reject unauthenticated/invalid requests to the other services — test this, don't just assume it works
- Validate input server-side on anything that reaches MySQL (numeric fields especially) — don't rely on the frontend alone
- Run `docker scout cves` or `trivy image` on your built images before submitting; fix or document anything high/critical — the rubric expects "reviewed scan results," not a clean scan

### Resource limits & performance (10 marks)

- Set `deploy.resources.limits` (cpus/memory) in Compose for at least the Analytics Service and the databases, and write down *why* those numbers (e.g. "Analytics Service capped at 0.5 CPU/256MB — it's a periodic batch job, not latency-sensitive")
- Load test with something simple and repeatable: `k6`, `hey`, or even a small script hitting the Enter Data endpoint in a loop — record throughput, error rate, CPU/memory (`docker stats`)
- Make **two** justified improvements (e.g. connection pooling, an index on the MySQL table, caching analytics results) and re-run the same test to compare

### Logs & CI/CD (10 marks)

- Structured, useful log lines (what happened, when, which service) — never log passwords, tokens, or full user records
- CI pipeline (GitHub Actions) should run on every PR: lint/build → tests → build images → vulnerability scan → tag (e.g. by git SHA or semver) → push to the registry, at least on merge to `main`
- Keep the pipeline fast enough that people actually wait for it — cache dependencies (`actions/cache`, Docker layer caching) rather than reinstalling everything every run

### Common pitfalls

- Forgetting to re-test the clean-environment deployment instructions right before submission — what works on your laptop with cached images may not work on a fresh clone
- Treating the architecture diagram and README as an afterthought — they're graded deliverables, not optional polish
- Letting one person become the only one who understands the CI pipeline or the Compose networking — the 25-mark defense assumes everyone can answer questions about any part of the system

## Milestone Checklist (mapped to the rubric)

| Rubric category | Marks | Done when… | Owner |
| --- | --- | --- | --- |
| Functionality & Architecture | 15 | All 5 services run together via one `docker compose up`; data flows Enter Data → MySQL → Analytics → MongoDB → Show Results |  |
| Docker & Optimization | 15 | Every service has a Dockerfile; ≥1 multi-stage build; multi-arch build tested; before/after size & build-time evidence captured |  |
| Security | 15 | No secrets in git history; non-root containers where possible; Auth Service blocks unauthenticated calls; input validated; scan run and results reviewed |  |
| Reliability & Persistence | 10 | Health checks on every service/db; two services killed and recovery documented; volume data survives `docker compose down` + `up` |  |
| Performance & Observability | 10 | Load test run with recorded throughput/errors/CPU/memory; two improvements made and compared; logs are useful and secret-free |  |
| CI/CD & Documentation | 10 | Pipeline tests, builds, scans, tags, and publishes images on every merge; README gives clean-environment deploy steps; architecture diagram done |  |
| Presentation/Demo/Defense | 25 | Every team member can explain any service and answer questions on it, not just their own |  |

### Deliverables checklist

- [ ] Source code, Dockerfiles, `docker-compose.yml`, tests, CI config — all in the repo
- [ ] Architecture diagram (can mirror the course's Fig. 1, labeled with your actual service/container names)
- [ ] README with clean-environment deployment instructions
- [ ] Short technical report covering security, reliability, optimization, performance, persistence, and CI/CD evidence
- [ ] Presentation/demo prepared, and everyone has rehearsed answering questions outside their own service
- [ ] Final check: no real passwords, API keys, tokens, or private keys anywhere in the repo (including git history)
