# NYX Platform

NYX is an institutional-grade financial infrastructure platform engineered for financial correctness, double-entry bookkeeping, atomic fund transfers, and strong data consistency.

Designed around Clean Architecture and Domain-Driven Design (DDD) principles, NYX provides the foundational core required for high-volume banking services, payment processing engines, and transactional ledger operations.

---

## Architectural Principles & Guarantees

### 1. Immutable Double-Entry Ledger

Every financial movement within the platform is recorded as a balanced `LedgerTransaction` composed of at least two `LedgerEntry` records. The system enforces the fundamental accounting equation across all operations:

$$\sum \text{Debits} = \sum \text{Credits}$$

Direct modifications or deletions of balance values are architecturally prohibited. Account balances are strictly derived from or validated against historical ledger postings.

### 2. Concurrency Control & Race Condition Prevention

To prevent overdrafts and race conditions during concurrent transactions on identical accounts, the transfer use case utilizes pessimistic row-level locking (`SELECT ... FOR UPDATE`) within an atomic database transaction. Balance checks and state updates are executed sequentially under strict transaction boundaries.

### 3. Distributed Idempotency

All mutating endpoints (`/transfers`, `/accounts/:id/deposit`, `/payments`) mandate an `idempotencyKey`. The system persists idempotency keys and returns previously cached responses for duplicate submissions, ensuring zero duplicate debits or credits across network retries.

### 4. Transactional Outbox Pattern

Domain events and integration webhooks are written to an `Outbox` table within the exact same database transaction that commits ledger changes. A dedicated dispatcher polls pending outbox entries, signs payloads using HMAC-SHA256, and dispatches them with exponential backoff and delivery tracking.

### 5. Automated Ledger Reconciliation

The platform features an automated reconciliation engine that aggregates historical debit and credit ledger entries for any account and validates that the computed ledger balance strictly equals the current account balance. Discrepancies are flagged immediately with full audit metadata.

---

## Tech Stack

- **Monorepo Management:** pnpm Workspaces
- **Backend Service:** NestJS, TypeScript, Node.js 22 LTS
- **Data Layer:** PostgreSQL 16, Prisma ORM
- **Frontend Console:** Next.js 15 (App Router), React 19, Tailwind CSS
- **Shared Contracts:** Zod schema validation across client and server
- **Security & Hardening:** Bcrypt password hashing, JWT stateless authentication, RBAC, Helmet, CORS, Rate Limiting
- **Observability:** Prometheus metrics (`/metrics`), Kubernetes Liveness/Readiness probes (`/health/live`, `/health/ready`), Correlation IDs
- **Infrastructure:** Docker multi-stage images, Docker Compose, Terraform (AWS ECS Fargate, Aurora PostgreSQL, ALB)
- **CI/CD:** GitHub Actions workflows for automated linting, typechecking, test execution, Gitleaks secret detection, and container publishing

---

## Repository Structure

```text
nyx/
├── apps/
│   ├── api/                   # NestJS backend HTTP service and domain modules
│   │   ├── prisma/            # PostgreSQL schemas and relational migrations
│   │   └── src/
│   │       ├── common/        # Filters, interceptors, and correlation middleware
│   │       ├── config/        # Environment configurations and validation
│   │       ├── infrastructure/# Database connections and Prisma client
│   │       └── modules/
│   │           ├── accounts/  # Account management and balance querying
│   │           ├── audit/     # Immutable security audit trail
│   │           ├── auth/      # JWT authentication and role-based guards
│   │           ├── customers/ # Customer profile lifecycle
│   │           ├── health/    # Operational liveness and readiness probes
│   │           ├── ledger/    # Double-entry ledger core and double-entry rules
│   │           ├── observability/ # Prometheus metrics collection
│   │           ├── outbox/    # Transactional outbox event bus
│   │           ├── payments/  # External payment ingestion
│   │           ├── reconciliation/ # Balance audit and reconciliation engine
│   │           ├── transfers/ # Atomic transfer use cases and locking
│   │           └── webhooks/  # Webhook registration and HMAC dispatcher
│   └── web/                   # Next.js 15 operational console
│       └── src/
│           ├── app/           # App Router pages and global stylesheets
│           ├── components/    # Financial dashboard, status badges, and controls
│           └── lib/           # Utility functions and formatting helpers
├── packages/
│   └── contracts/             # Shared Zod schemas and TypeScript interfaces
├── infrastructure/
│   ├── docker/                # Multi-stage Dockerfiles for API and Web
│   ├── scripts/               # Automated database backup and restore scripts
│   └── terraform/             # AWS ECS, Aurora, and networking definitions
├── docker-compose.yml         # Local development stack (API, Web, PostgreSQL)
├── docker-compose.prod.yml    # Production container composition
└── pnpm-workspace.yaml        # Workspace package definitions
```

---

## Security & Compliance Architecture

- **Stateless Authentication:** JSON Web Tokens (JWT) signed with HMAC-SHA256, carrying user identity and role claims.
- **Role-Based Access Control (RBAC):** Hierarchical permissions governing access to administrative, operator, and read-only financial resources (`admin`, `operator`, `auditor`).
- **Account Ownership Verification:** Transfer requests verify that the authenticated identity owns or has explicit authorization over the debited source account.
- **Append-Only Audit Trail:** Critical operations (user authentication, account creation, manual adjustments, webhook endpoint updates) are recorded in an append-only `AuditLog` table containing user identity, IP address, user agent, correlation ID, and state diffs.
- **HMAC Webhook Signatures:** Outgoing webhook notifications include `X-Nyx-Signature` computed using HMAC-SHA256 over timestamped payload bodies to protect downstream consumers against tampering and replay attacks.
- **Defensive HTTP Hardening:** Helmet-configured security headers, strict CORS policies, and global rate limiting.

---

## Observability & Metrics

NYX exports native Prometheus metrics via the `/metrics` endpoint:

- `nyx_http_requests_total`: Monotonically increasing counter partitioned by HTTP method, route, and status code.
- `nyx_http_request_duration_seconds`: Response latency histogram for performance analysis and SLA monitoring.
- `nyx_db_connection_pool_size`: Active database connection gauge.

Dedicated Kubernetes probes ensure zero-downtime rolling updates:

- `/health/live`: Liveness probe indicating service responsiveness.
- `/health/ready`: Readiness probe verifying active database connectivity before traffic routing.

---

## Visual Identity & Frontend Console

The web console (`apps/web`) is crafted with a nocturnal, technological aesthetic inspired by the Greek deity Nyx:

- **Deep Night Background:** `#100F1D`
- **Sidebar & Elevated Panels:** `#151527`
- **Surface Cards & Tables:** `#191B35`
- **Primary Interactive Purple:** `#7963B5`
- **Lavender Metrics & Highlights:** `#B8A5E8`
- **High-Contrast Text:** `#E5E0F0` (conforms to WCAG AAA with a 14.8:1 contrast ratio)
- **Subdued Slate Muted Text:** `#9291AA`
- **Restrained Structural Borders:** `#302C45`

The interface avoids generic fintech greens and blue templates in favor of a focused, institutional financial monitoring experience.

---

## Getting Started

### Prerequisites

- Node.js >= 22.0.0 (LTS)
- pnpm >= 9.0.0
- Docker and Docker Compose

### Local Development Setup

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd nyx
   ```

2. **Configure environment variables:**

   ```bash
   cp .env.example .env
   ```

3. **Start PostgreSQL database:**

   ```bash
   docker compose up -d postgres
   ```

4. **Install dependencies:**

   ```bash
   pnpm install
   ```

5. **Execute database migrations:**

   ```bash
   pnpm --filter @nyx/api exec prisma migrate dev
   ```

6. **Start development services:**

   ```bash
   pnpm dev
   ```

   - API Service: `http://localhost:3000`
   - Web Console: `http://localhost:3001`
   - Prometheus Metrics: `http://localhost:3000/metrics`
   - Health Probes: `http://localhost:3000/health/ready`

---

## Testing & Quality Verification

The repository enforces strict quality standards via automated CI checks:

```bash
# Run linting across all packages
pnpm lint

# Run TypeScript typechecks
pnpm typecheck

# Validate code formatting
pnpm format:check

# Execute unit and integration tests
pnpm test

# Build production bundles
pnpm build
```

---

## Production Operations & Disaster Recovery

### Automated Database Backups

Database backups are handled via automated scripts located in `infrastructure/scripts/`:

```bash
# Create compressed, timestamped backup with SHA-256 verification
./infrastructure/scripts/backup-database.sh

# Restore database from backup archive with pre-execution verification
./infrastructure/scripts/restore-database.sh /path/to/backup.sql.gz
```

### Infrastructure as Code

Production and staging infrastructure on AWS is provisioned through modular Terraform configurations in `infrastructure/terraform/`:

- VPC, private and public subnets across 2 Availability Zones
- ECS Fargate cluster with Auto-Scaling and Application Load Balancer
- AWS Aurora PostgreSQL Multi-AZ with automated encrypted snapshots
- AWS Secrets Manager integration for database credentials and JWT keys

---

## License

Proprietary. All rights reserved.
