# Architecture

## Overview

InvoiceFlow AI is a single-page React application backed by Supabase (PostgreSQL). All deterministic business logic — data generation, matching, lifecycle, evaluation — runs as TypeScript modules in the browser. The database is the single source of truth; the domain modules are pure functions over data fetched from Supabase.

```
┌─────────────────────────────────────────────────┐
│  Browser (React SPA)                            │
│                                                 │
│  Pages ──► lib/queries ──► Supabase JS client   │
│    │                            │               │
│    │                            ▼               │
│    │                     PostgreSQL (Supabase)  │
│    │                                             │
│    ▼                                             │
│  domain/ (pure TS)                              │
│    generator.ts  matchingEngine.ts              │
│    lifecycle.ts  evaluation.ts  validation.ts   │
│    money.ts  rng.ts  ids.ts  config.ts          │
└─────────────────────────────────────────────────┘
```

## Layers

1. **`src/domain/`** — pure TypeScript, no I/O. Deterministic and unit-testable.
   - `rng.ts` — mulberry32 seeded PRNG
   - `money.ts` — Decimal-style rounding helpers
   - `ids.ts` — business ID formatters + invoice-number normalization
   - `generator.ts` — synthetic dataset generator
   - `matchingEngine.ts` — three-way matching rules
   - `lifecycle.ts` — state-transition + approval/payment guards
   - `evaluation.ts` — ground-truth comparison metrics
   - `validation.ts` — dataset integrity checks
   - `extraction.ts` — replaceable extraction adapter

2. **`src/lib/`** — I/O boundary.
   - `supabase.ts` — singleton client
   - `queries.ts` — all database reads/writes + authorization checks
   - `seed.ts` — orchestrates generate → validate → insert → match → evaluate
   - `session.ts` — demo role switcher

3. **`src/components/`** — shared UI (layout, badges, modals, states).

4. **`src/pages/`** — the 9 dashboard pages.

## Data Flow

1. User clicks **Generate** in Data Lab → `seed.ts` calls `generateDataset(seed, scale)`.
2. `validateDataset()` runs locally; if it passes, all rows are inserted in dependency order.
3. For every invoice, `runMatch()` produces rule results → persisted as `rule_executions` and `exceptions`.
4. `evaluate()` compares outcomes to `ground_truth` → persisted as an `evaluation_run`.
5. Pages read from Supabase via `queries.ts`; no hardcoded metrics.

## Authorization

Role checks live in `queries.ts` (e.g. `resolveException`, `decideApproval`). The frontend hides controls for unauthorized roles, but the data-access layer is the real enforcement point — a request from any role that fails the check throws before touching the database.
