# NYX

A payments platform I built to study what it actually takes to keep money correct: double-entry bookkeeping, atomic transfers, idempotency, a transactional outbox, and reconciliation.

This is a personal project, not a product in production. It runs end to end locally, has integration tests around the financial flows, and includes Terraform for an AWS deployment that has never carried real traffic. The point was to make the hard decisions myself and understand why each one exists.

---

## What it does

- Customers hold accounts with balances derived from ledger entries, never edited directly.
- Transfers move money between accounts atomically, with row-level locking and idempotency keys.
- Incoming payments are recorded and later reconciled against the ledger.
- Domain events go through an outbox and are delivered as signed webhooks.
- A reconciliation job compares ledger history against current balances and flags mismatches.
- A Next.js console lets you create accounts, move money, and inspect the ledger and audit trail.

---

## Design decisions

### Double-entry ledger

Every movement is a `LedgerTransaction` with at least two `LedgerEntry` rows, and the database rejects unbalanced postings. Customer account balances are transactionally updated projections that are reconciled against ledger entries; they are not the accounting source of truth. Internal clearing accounts are currency-specific ledger accounts, not customer accounts.

### Concurrency control

Transfers run inside a single database transaction and lock the affected account rows with `SELECT ... FOR UPDATE` before checking balances. Without that, two concurrent transfers can both read the same balance and overdraw the account. The lock is the boring, correct answer here; optimistic retries would also work but add more moving parts.

### Idempotency

`/transfers`, `/accounts/:id/deposit`, `/payments`, and transfer reversals require an `idempotencyKey`. The operation and a SHA-256 fingerprint of its canonical request are committed with the financial posting. Retries return the original result, while reuse of a key with different parameters is rejected. A transfer can have at most one reversal.

### Transactional outbox

Events are written to an `Outbox` table in the same transaction that commits the ledger change. Dispatchers claim rows with leases and PostgreSQL `SKIP LOCKED`, sign payloads with HMAC-SHA256, and retry failed endpoints without resending successful deliveries. Delivery is at-least-once: the delivery ID stays stable across retries, and consumers should deduplicate by that ID.

### Reconciliation

The reconciliation engine sums historical debits and credits for an account and compares the result with the stored balance. Any difference is flagged with the metadata needed to investigate. This is the safety net for bugs that slip past the other guarantees.

---

## Stack

- **Monorepo:** pnpm workspaces
- **API:** NestJS 11, TypeScript, Node.js 22
- **Data:** PostgreSQL 16, Prisma 6
- **Web console:** Next.js 15 (App Router), React 19, Tailwind CSS
- **Shared contracts:** Zod schemas used by both API and web
- **Auth and hardening:** bcrypt, JWT, RBAC, Helmet, CORS, rate limiting
- **Observability:** Prometheus metrics, liveness and readiness probes, correlation IDs
- **Infrastructure:** multi-stage Docker images, Docker Compose, Terraform for AWS ECS Fargate and Aurora PostgreSQL
- **CI:** GitHub Actions for lint, typecheck, tests, Gitleaks, and image publishing

---

## Repository structure

```text
nyx/
├── apps/
│   ├── api/                   # NestJS service
│   │   ├── prisma/            # schema and migrations
│   │   └── src/
│   │       ├── common/        # filters, interceptors, correlation middleware
│   │       ├── config/        # environment validation
│   │       ├── infrastructure/# Prisma client and database wiring
│   │       └── modules/
│   │           ├── accounts/       # account lifecycle and balances
│   │           ├── audit/          # append-only audit trail
│   │           ├── auth/           # JWT auth and role guards
│   │           ├── customers/      # customer profiles
│   │           ├── health/         # liveness and readiness
│   │           ├── ledger/         # double-entry core
│   │           ├── observability/  # Prometheus metrics
│   │           ├── outbox/         # transactional outbox
│   │           ├── payments/       # incoming payments
│   │           ├── reconciliation/ # balance verification
│   │           ├── transfers/      # atomic transfers
│   │           └── webhooks/       # registration and HMAC delivery
│   └── web/                   # Next.js console
│       └── src/
│           ├── app/           # routes
│           ├── components/    # dashboard, tables, status badges
│           └── lib/           # formatting and helpers
├── packages/
│   └── contracts/             # shared Zod schemas and types
├── infrastructure/
│   ├── docker/                # Dockerfiles
│   ├── scripts/               # backup and restore scripts
│   └── terraform/             # AWS definitions
├── docker-compose.yml
├── docker-compose.prod.yml
└── pnpm-workspace.yaml
```

---

## Security

- JWT authentication with role claims and three roles: `admin`, `user`, `auditor`.
- Authentication is required by default. Health checks, metrics, login, and public registration are the explicit public routes.
- Public registration always creates an unprivileged user without customer ownership. The initial administrator is provisioned through the local administration command.
- Webhook secrets are encrypted at rest with AES-256-GCM. Production requires a separately managed `WEBHOOK_SECRET_ENCRYPTION_KEY`.
- Webhook destinations are revalidated at registration and dispatch, private and reserved network addresses are rejected, DNS results are pinned for the request, and redirects are not followed.
- Transfers check that the caller owns or is authorized over the source account.
- Financial operation audit records include the actor, client IP, correlation ID, and operation details. They commit in the same database transaction as the financial posting. The audit table is not backed by external WORM storage.
- Outgoing webhooks carry an `X-Nyx-Signature` HMAC-SHA256 over a timestamped body, so consumers can reject tampered or replayed requests.
- Helmet headers, strict CORS, and global rate limiting.

This is application-level security. It is not a compliance implementation, and there is no PCI scope anywhere in the project.

---

## Observability

`/metrics` exposes:

- `nyx_http_requests_total`, by method, route, and status
- `nyx_http_request_duration_seconds`, a latency histogram
- `nyx_db_connection_pool_size`

`/health/live` reports process responsiveness. `/health/ready` checks database connectivity before accepting traffic.

---

## Web console

The console uses a dark palette built around `#100F1D` and `#191B35`, with `#7963B5` as the interactive color and `#E5E0F0` for text. The idea was a monitoring screen you can stare at for a while, not a marketing page.

---

## Running locally

Requirements: Node.js 22, pnpm 9, Docker.

```bash
git clone <repository-url>
cd nyx
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm --filter @nyx/api exec prisma migrate dev
pnpm --filter @nyx/api admin:create
pnpm dev
```

Set `NYX_ADMIN_EMAIL` and `NYX_ADMIN_PASSWORD` before running `admin:create`. Public registration always creates an unprivileged user and cannot assign roles or customer ownership.

- API: `http://localhost:3000`
- Web: `http://localhost:3001`
- Metrics: `http://localhost:3000/metrics`
- Health: `http://localhost:3000/health/ready`

---

## Tests and checks

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm build
```

The test suite is made of integration tests against a real PostgreSQL instance, covering the ledger, idempotency, concurrent transfers, auth boundaries, the audit trail, webhooks, payments, and reconciliation. I favored integration tests over unit tests here because the interesting failures live at the transaction boundary, not inside a single function.

---

## Operations

Backups are handled by scripts in `infrastructure/scripts/`:

```bash
./infrastructure/scripts/backup-database.sh
./infrastructure/scripts/restore-database.sh /path/to/backup.sql.gz
```

Terraform in `infrastructure/terraform/` describes a VPC across two availability zones, an ECS Fargate service behind an ALB, Aurora PostgreSQL Multi-AZ, and Secrets Manager for credentials. It is written to be a realistic setup, not a battle-tested one.

---

## Limitations

Worth being explicit about, because the gaps are part of the project:

- Single region, single currency, no sharding. Correctness was the goal, not throughput.
- The outbox dispatcher is a polling worker. At real volume this becomes a queue or a CDC pipeline.
- Terraform has never run against production traffic, so treat it as a design exercise.
- Metrics and rate limiting are basic. There is no tracing, no alerting, no dashboards.
- No card network integration, no PCI scope, no regulatory reporting.
- The web console is for inspection and demos, not for operators under load.

---

## License

Personal project. The code is public so it can be read and reviewed. No license is granted for reuse.
