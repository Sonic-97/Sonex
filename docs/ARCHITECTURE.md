# Sonex Architecture Overview

## Pipeline
```
External Channel (Telegram / WhatsApp / Web Chat / Mobile)
  → Adapter Platform (normalizer, session, formatter)
    → Context Builder (#6.1)
      → Commerce Brain (#6.2)
        → Decision Validator (#6.2.5)
          → Action Planner (#11)
            → Action Executor (#12)
              → Back to Adapter Platform → User
```

## Core Services (Frozen)
| #  | Service                  | Role |
|----|--------------------------|------|
| 6.1| Context Builder          | Builds CommerceContext from message + session |
| 6.2| Commerce Brain           | AI + local decision engine |
| 6.2.5| Decision Validator      | Validates & enriches AI decisions |
| 7  | Order Orchestrator       | Multi-merchant order lifecycle |
| 8  | Driver Dispatch          | Driver assignment |
| 8.5| Driver Presence          | Heartbeat tracking |
| 9  | Merchant Availability    | Operational state |
| 10 | Merchant Communication Hub| Merchant messaging |
| 10.5| Trust & Reputation      | Scoring/badges |
| 11 | Action Planner           | Converts decision to ActionPlan |
| 12 | Action Executor          | Executes plan steps |

## API Layers
| Layer       | Stack           | Purpose |
|-------------|-----------------|---------|
| Telegram    | Telegraf        | Bot adapter |
| Adapter Platform | NestJS    | Multi-channel abstraction |
| Merchant API| NestJS REST     | Merchant portal |
| Driver API  | NestJS REST     | Driver mobile |
| Customer API| NestJS REST     | Customer-facing |

## Data Flow
```
Incoming → Normalize → Session Resolve → Pipeline → Format → Send
```

## Key Decisions
- Pure transport adapters: no business logic, no AI, no DB
- Stateless services: horizontal scale via Docker
- Event-driven: DomainEventBus for cross-service communication
- Prometheus metrics: `sonic_` namespace for all operations
