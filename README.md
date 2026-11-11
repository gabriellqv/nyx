# NYX

NYX is a financial infrastructure platform designed with a primary focus on financial correctness, double-entry bookkeeping, atomic transfers, and strict data consistency.

## Overview

The platform models critical financial workflows with high reliability:
- **Ledger:** Immutable double-entry bookkeeping ensuring debits and credits always balance.
- **Transfers:** Atomic transaction processing with distributed idempotency and concurrency protection.
- **Architecture:** Modular monolith following Clean Architecture and Domain-Driven Design principles.
- **Contract-first:** Shared validation and API contracts using Zod across frontend and backend.

## Tech Stack

- **Monorepo:** pnpm Workspaces
- **Backend:** NestJS (Node.js) with TypeScript
- **Frontend:** Next.js (App Router, React) with Tailwind CSS and shadcn/ui
- **Database & ORM:** PostgreSQL with Prisma ORM
- **Testing:** Jest (unit), Supertest (integration), Playwright (E2E)
- **Containerization:** Docker & Docker Compose

## Repository Structure

```text
nyx/
├── apps/
│   ├── api/          # NestJS backend HTTP service and modules
│   └── web/          # Next.js web application
├── packages/
│   └── contracts/    # Shared Zod schemas and request/response contracts
├── infrastructure/
│   └── docker/       # Container and local infrastructure definitions
├── docs/             # Architecture, domain specifications, and ADRs
└── docker-compose.yml
```

## Getting Started

### Prerequisites

- Node.js >= 22 (LTS)
- pnpm >= 9
- Docker & Docker Compose

### Quickstart

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Start local services:
   ```bash
   docker compose up -d
   ```

3. Run development servers:
   ```bash
   pnpm dev
   ```

## License

Private / Proprietary.
