# Team Guide (internal planning notes)

## Overview

The team is building the **Data Collection and Analytics System**.

The system has six components. Use at least two programming languages (e.g. Node.js for the web apps, Python for Analytics).

| Component | Job |
| --- | --- |
| Enter Data web app | Authenticated users enter numeric data; writes to MySQL |
| Authentication Service | Validates users; protects both web apps |
| Analytics Service | Reads raw data from MySQL, computes min/max/average/count, writes results to MongoDB |
| Show Results web app | Authenticated users view analytics stored in MongoDB |
| MySQL | Raw data |
| MongoDB | Computed analytics |

| Person | Owns |
| --- | --- |
| A | Authentication Service, Compose networking/secrets |
| B | Enter Data web app, CI build and test stages |
| C | Show Results web app, CI scan and publish stages |
| D | Analytics Service, MySQL, MongoDB, volumes and health checks |

Everyone reviews every PR. Each person must be able to explain the whole system in the defense.

## Preparation

- Monorepo: `services/<name>/` (Dockerfile, source, tests, `.dockerignore`), plus `docker-compose.yml`, `.github/workflows/ci.yml`, `docs/`, `.env.example`
- Install Docker with Compose v2 (`docker compose`), git, and a scanner (`trivy` or `docker scout`)
- Pick one registry for everyone (GitHub Container Registry is simplest)
- Protect `main`: PR required, 1 approval, CI must pass
- Add `.gitignore` (including `.env`) and `.env.example` with placeholder values only
- Agree on base images per language (e.g. `python:3.12-slim`, `node:20-alpine`)

Compose and the CI workflow sit at the root and build every service folder; each service is self-contained.

```text
cit3495-project1/
├── README.md
├── .gitignore
├── .env.example
├── docker-compose.yml
├── .github/
│   └── workflows/
│       └── ci.yml
├── docs/
└── services/
    ├── auth/
    │   ├── Dockerfile
    │   ├── .dockerignore
    │   ├── src/
    │   └── tests/
    ├── enter-data/
    │   ├── Dockerfile
    │   ├── .dockerignore
    │   ├── src/
    │   └── tests/
    ├── show-results/
    │   ├── Dockerfile
    │   ├── .dockerignore
    │   ├── src/
    │   └── tests/
    └── analytics/
        ├── Dockerfile
        ├── .dockerignore
        ├── src/
        └── tests/
```

**AI-generated code rules**

- The owner reads and understands every generated file before committing it
- No generated secrets or passwords in the repo; placeholders and `.env` only
- Generated Dockerfiles get checked for: root user, missing `.dockerignore`, no multi-stage build, copying too much into the final image
- Note in each service README which parts were AI-assisted

## Workflow

- Short-lived branches (`feat/...`, `fix/...`, `chore/...`); `main` always starts cleanly from a fresh clone
- Every PR states: service, what changed, how to test it, whether it was AI-assisted
- Merge needs 1 approval from someone who does not own that service, and green CI (build, tests, image build, vulnerability scan)
- Track work as GitHub Issues, one per rubric requirement, labeled by area (`docker`, `security`, `reliability`, `performance`, `ci-cd`, `docs`)

**Review checklist**

- [ ] No hardcoded secrets or connection strings
- [ ] Container does not run as root without a documented reason
- [ ] Config comes from environment variables
- [ ] Logs contain no secrets or full request bodies
- [ ] New or changed service has a health check

## Requirements

| Area | What must be done |
| --- | --- |
| Dockerfiles and Compose | A Dockerfile for every application service; one `docker-compose.yml` for the whole system |
| Images | Suitable base images, `.dockerignore`, efficient layers, at least one multi-stage build, amd64 and arm64 support (`docker buildx build --platform linux/amd64,linux/arm64`) |
| Networking | Publish ports only for the two web apps; MySQL, MongoDB, Analytics, Auth stay private on a Compose network and reach each other by service name |
| Persistence | Named volumes for MySQL and MongoDB; data survives container recreation |
| Health and recovery | `healthcheck` on every service and database; `depends_on` with `condition: service_healthy`; `restart: unless-stopped` |
| Security | No hardcoded secrets (`.env` or Compose secrets); non-root containers where practical; Auth Service rejects unauthenticated requests; server-side input validation |
| Resources | CPU and memory limits on selected services (at least Analytics and the databases), each with a written justification |
| Logs | Useful, structured logs that never include passwords, tokens or full user records |
| Testing and CI | GitHub Actions that runs tests, builds images, runs a security scan, tags images (git SHA or version) and publishes to the registry |

**Evidence to capture**

| Evidence | What to record |
| --- | --- |
| Docker optimization | Image size and build time before and after at least one Dockerfile change |
| Security | Protected access working, private services unreachable from the host, secrets kept out of the repo, one vulnerability scan with reviewed results |
| Failure test | Stop at least two services or dependencies (e.g. MySQL, Analytics); describe what users see and how the system recovers |
| Performance | Repeatable load test (e.g. `k6` or `hey`); throughput, errors, CPU and memory from `docker stats`; at least two justified improvements, compared against the baseline |
| Persistence | Write data, recreate the database container, show the data is still there |
| CI/CD | A successful pipeline run that tests, builds, scans, tags and publishes |

## Deliverables

- [ ] Source code, Dockerfiles, `docker-compose.yml`, tests, CI config
- [ ] Architecture diagram with your real service names
- [ ] README with clean-environment deployment instructions
- [ ] Short technical report: security, reliability, optimization, performance, persistence, CI/CD evidence
- [ ] Presentation, demo and technical defense
- [ ] No real passwords, API keys, tokens or private keys anywhere in the repo or its history

Marks: Functionality 15, Docker 15, Security 15, Reliability 10, Performance 10, CI/CD and docs 10, Presentation/defense 25.
