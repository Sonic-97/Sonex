# Sonex — AI-Powered Multi-Channel Coffee Commerce

A production-grade omnichannel commerce system for the coffee industry. Customers order via **Telegram**, **WhatsApp**, **Web Chat**, or **Mobile App** — drivers deliver, merchants manage, and AI orchestrates the flow.

## Architecture

```
External Channel (Telegram / WhatsApp / Web Chat / Mobile)
  → Adapter Platform (normalize, session, format)
    → Context Builder
      → Commerce Brain (AI + local decision)
        → Decision Validator
          → Action Planner → Action Executor
            → Back to Adapter Platform → User
```

Pure transport adapters at the edge, stateless services in the middle, event-driven orchestration throughout.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS 11, TypeScript 6, PostgreSQL 16 |
| Frontend | Next.js 16, React 19, Tailwind CSS v4 |
| Desktop | Tauri (Rust) |
| Core SDK | Napi-rs (Rust → Node.js native addon) |
| AI | OpenAI, local fallback decision engine |
| Queue | BullMQ (Redis) |
| Auth | JWT, Passport, Refresh Tokens |
| Observability | Prometheus, Pino logging |
| Deployment | Docker, Docker Compose |

## Project Structure

```
sonex/
├── backend/          # NestJS API server
│   ├── src/
│   │   ├── adapter-platform/  # Multi-channel normalization
│   │   ├── auth/              # JWT + refresh auth
│   │   ├── commerce-brain/    # AI decision engine
│   │   ├── onboarding/        # Merchant/driver wizard
│   │   ├── orders/            # Order orchestration
│   │   ├── dispatch/          # Driver assignment
│   │   ├── presence/          # Driver heartbeat
│   │   ├── merchant/          # Availability, communication
│   │   ├── pricing/           # Dynamic pricing engine
│   │   ├── catalog/           # Product catalog
│   │   ├── invoice/           # PDF invoice generation
│   │   ├── analytics/         # Business intelligence
│   │   ├── reports/           # Reporting engine
│   │   ├── telegram/          # Telegram bot adapter
│   │   └── whatsapp/          # WhatsApp adapter
│   ├── prisma/                # Schema + migrations
│   └── test/                  # E2E tests
├── frontend/         # Next.js merchant PWA
│   ├── src/
│   │   ├── app/               # App router pages
│   │   ├── components/        # Shared UI + features
│   │   └── lib/               # Utilities, hooks, API
│   └── messages/             # i18n (en, ar)
├── desktop/          # Tauri desktop app
├── sonex-core/       # Rust native addon (Napi-rs)
├── sonex-specs/      # Architecture specs & policies
├── docs/             # Operations, deployment, onboarding
└── docker-compose.yml
```

## Quick Start

```bash
# 1. Copy environment variables
cp backend/.env.example backend/.env

# 2. Start infrastructure
docker compose up -d postgres redis

# 3. Install & build
cd backend && npm install && npx prisma migrate dev && cd ..
cd frontend && npm install && cd ..

# 4. Start development
cd backend && npm run dev
cd frontend && npm run dev
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production deployment.

## Key Features

- **Multi-Channel Adapter Platform** — Normalize messages from Telegram, WhatsApp, Web Chat, and Mobile into a uniform pipeline (Feature #25)
- **AI Commerce Brain** — GPT-based order processing with local fallback decision engine (Feature #6)
- **Dynamic Pricing** — Rule-based pricing with conditional logic, date ranges, and event-driven re-evaluation (Feature #18)
- **Order Orchestration** — Multi-merchant order lifecycle with split orders and driver dispatch
- **Merchant Onboarding Wizard** — Step-by-step merchant registration with document upload and Google Maps integration
- **Driver Dispatch** — Real-time assignment with presence tracking and reputation scoring
- **PWA Frontend** — Arabic-first, RTL responsive merchant portal with real-time order management
- **PDF Invoice Engine** — Dynamic invoice generation with bilingual support
- **Prometheus Monitoring** — `sonic_` namespace metrics across all operations

## Documentation

| Doc | Description |
|-----|-------------|
| [Architecture](docs/ARCHITECTURE.md) | Pipeline, services, data flow |
| [Deployment](docs/DEPLOYMENT.md) | Production setup, Docker, env vars |
| [Operations](docs/OPERATIONS.md) | Backup, restore, rollback, incidents |
| [Merchant Onboarding](docs/ONBOARDING_MERCHANT.md) | Merchant wizard process |
| [Driver Onboarding](docs/ONBOARDING_DRIVER.md) | Driver registration flow |

## License

MIT
