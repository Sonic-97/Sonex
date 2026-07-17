# Sonex Desktop Edition

Offline-first desktop POS and cafe management system for Sonex Coffee OS.

## Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Tauri 2.x |
| Frontend | Next.js 16 + React 19 + Tailwind v4 |
| Backend | Rust (axum, SQLx) |
| Database | SQLite |
| State | Zustand |
| Icons | Lucide React |

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) v18+
- npm v9+

### Development

```bash
# Install frontend dependencies
cd desktop && npm install

# Start Next.js dev server
npm run dev

# In another terminal, start Tauri dev mode
npm run tauri dev
```

### Build

```bash
# Production build
cd desktop
npm run build
npm run tauri build
```

## Project Structure

```
desktop/
├── src-tauri/          # Rust backend
│   ├── src/
│   │   ├── main.rs     # Tauri entry point
│   │   ├── lib.rs       # App setup, server start
│   │   ├── server/      # Local HTTP API (axum)
│   │   ├── db/          # SQLite via SQLx
│   │   ├── settings/    # Settings types
│   │   └── logging/     # Tracing config
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                # Next.js frontend
│   ├── app/            # Pages (routing)
│   ├── components/     # React components
│   ├── hooks/          # Custom hooks
│   ├── lib/            # API client, utilities
│   ├── store/          # Zustand stores
│   ├── styles/         # Tailwind CSS
│   └── types/          # TypeScript types
├── package.json
├── next.config.ts
└── tsconfig.json
```

## Architecture

- **Offline-first**: All operations write to local SQLite first
- **Local API**: Rust axum server on `localhost:5112` mirrors NestJS endpoints
- **Sync engine**: Background sync queue with conflict resolution
- **Dark/light theme**: System-aware with manual override
