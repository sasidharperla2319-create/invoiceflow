# InvoiceFlow AI — Phase 1 Fix Report

**Date:** 2026-10-27  
**Scope:** Critical bug fixes only. No schema changes. No destructive DB operations.  
**Baseline:** `audit/PROJECT_STATUS.md`

---

## Verification Summary

| Check | Result |
|-------|--------|
| `npm run typecheck` (tsc --noEmit) | ✅ Exit 0 — no errors |
| `npm run build` (vite build) | ✅ Exit 0 — 2276 modules transformed |
| `npm test` (vitest run) | ✅ 23 tests in 3 test files — all pass |

---

## Task 1 — Payment Readiness Crash Fix

### Root Cause
`PaymentReadinessPage.tsx` called a query that ordered by `invoices.paid_at`. That column **does not exist** on the `invoices` table. Only the `payments` table has a `paid_at` column (timestamptz, nullable). The PostgREST query failed at runtime, crashing the entire Payment Readiness page.

### Fix
**File:** `src/lib/queries.ts`

Added `fetchPaidInvoices(limit = 50)` — a new function separate from `fetchPaymentReadyInvoices()`:

```ts
export async function fetchPaidInvoices(limit = 50): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('payment_status', 'PAID')
    .order('updated_at', { ascending: false })   // updated_at is a real invoices column
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data as Invoice[]) ?? [];
}
```

**File:** `src/pages/PaymentReadinessPage.tsx`

- Replaced the crashing query call with `fetchPaidInvoices(50)`.
- Added a "Recently Paid Invoices" section that correctly reads `payments.paid_at` for display timestamps.
- Maintained all existing UI sections and design.

**Also updated:** `markPaymentPaid` in `queries.ts` to set `updated_at` when marking a payment record as PAID, so the ordering column stays meaningful.

---

## Task 2 — Exception Resolution Lifecycle Progression Fix

### Root Cause
`resolveException` in `queries.ts` was not re-evaluating the lifecycle state after resolving an exception. It had no business-logic path to:
- Transition from `EXCEPTION → APPROVAL_PENDING` after all exceptions are cleared.
- Keep `BLOCKED` if blocking exceptions remain.
- Guard against auto-approval or auto-payment-ready without explicit approval action.

### Fix

**File:** `src/domain/lifecycle.ts`

Added `ExceptionResolutionOutcome` interface and `evaluateExceptionResolution(invoice, exceptions)` function:

- **Partial resolution (unresolved remain):**
  - If any unresolved exception has `severity = 'BLOCKING'` → keeps `match_status = 'BLOCKED'`, `lifecycle_state = 'BLOCKED'`.
  - Otherwise → keeps `match_status = 'EXCEPTION'`, `lifecycle_state = 'EXCEPTION'`.
- **All resolved:**
  - If `approval_status` is already `'APPROVED'` → evaluates `isPaymentReady` and either advances to `PAYMENT_READY` or stays `APPROVED`.
  - Otherwise → transitions to `lifecycle_state = 'APPROVAL_PENDING'`, `approval_status = 'PENDING'`, sets `requiresApprovalTask: true`.
  - **Never auto-approves. Never auto-marks payment-ready without prior approval.**

**File:** `src/lib/queries.ts`

Updated `resolveException` to:

1. Check role authorization (`OPERATIONS_ANALYST` or `PROCESS_OWNER` only).
2. Handle idempotency safely — no-op on already-resolved exceptions.
3. Persist `status = 'RESOLVED'`, `resolution_notes`, `resolved_at` to `exceptions` table.
4. Log resolution action to `exception_assignments` and `audit_events`.
5. Fetch all exceptions for the invoice and call `evaluateExceptionResolution`.
6. Update `invoices` table with new `lifecycle_state`, `match_status`, `approval_status`, `payment_status`, and `updated_at`.
7. Insert a `state_transitions` record if lifecycle state changed.
8. Insert audit event for lifecycle update.
9. If `requiresApprovalTask: true`, ensure a `PENDING` approval task exists in `approvals` table (avoids duplicates).

---

## Task 3 — Missing Supabase Configuration Graceful Handling

### Root Cause
`createClient()` was called at module load time with empty strings when `.env` was missing, causing uncaught exceptions or silent API failures that surfaced as cryptic app crashes.

### Fix

**File:** `src/lib/supabase.ts`

- Added `isSupabaseConfigured(): boolean` — checks for empty strings, known placeholder values (`https://your-project.supabase.co`, `your-anon-key`).
- Passes placeholder-safe fallback credentials to `createClient` so the module never throws on load.
- `auth: { persistSession: false }` to avoid localStorage issues in unconfigured state.

**File:** `src/App.tsx`

- Calls `isSupabaseConfigured()` before any data fetching.
- If unconfigured: renders a friendly branded onboarding card explaining what to configure — no crash, no red screen.
- If configured: proceeds with normal data checks and page routing.

**Security:** Verified `.env` is listed in `.gitignore`. `.env.example` only contains placeholder values. No credentials are in tracked files.

---

## Task 4 — Database Security Review (RLS & Least Privilege)

### Current State (Demo / Development)

The schema applies RLS but uses permissive `anon` policies on every table:

```sql
CREATE POLICY "anon_inv_s" ON invoices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_inv_i" ON invoices FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_inv_u" ON invoices FOR UPDATE TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_inv_d" ON invoices FOR DELETE TO anon, authenticated USING (true);
```

This pattern repeats across all ~18 tables. The `anon` role can read and write everything.

### Risk Assessment

| Risk | Severity | Context |
|------|----------|---------|
| `anon` role can read all invoices, payments, PII | HIGH | Acceptable for local demo; unacceptable in production |
| `anon` role can DELETE invoices, payments, audit events | CRITICAL | Audit trail can be silently erased |
| No row-ownership check — any session can mutate any row | HIGH | No multi-tenant isolation |
| `service_role` key used in frontend (if Bolt.new pattern) | CRITICAL | Would bypass all RLS |

### Recommended Production Design (Phase 2)

> These are **not applied** in Phase 1. Applying them requires a new migration and auth setup.

1. **Remove `anon` write access** — `anon` should only be allowed to call RPCs that return specific read views, if at all.
2. **Add user-scoped policies** — e.g., `USING (auth.uid() = assigned_to_user_id)` on `exceptions`.
3. **Make `audit_events` append-only** — remove UPDATE/DELETE policies, use `service_role` for inserts only.
4. **Remove DELETE policies** from `invoices`, `payments`, `state_transitions` — soft-delete via `status` field.
5. **Use only the `anon` key in the frontend** — never the `service_role` key.
6. **Add enum-enforcement at DB level** for lifecycle transitions via a trigger that validates `VALID_TRANSITIONS`.

---

## Task 5 — Regression Test Suite

Test files created:

| File | Tests | Coverage |
|------|-------|----------|
| `src/domain/__tests__/payment_readiness.test.ts` | 11 | `isPaymentReady` guards, duplicate payment prevention, schema safety (no `paid_at` on invoices), sort column whitelist |
| `src/domain/__tests__/lifecycle_regression.test.ts` | 9 | Partial resolution (MEDIUM/BLOCKING), full resolution → APPROVAL_PENDING, no auto-approve, no auto-payment-ready, pre-approval → PAYMENT_READY only if already approved, role authorization, idempotency |
| `src/lib/__tests__/config_regression.test.ts` | 3 | `isSupabaseConfigured` boolean typing, client object safety, placeholder detection logic |

**Test run output:**
```
✓ src/domain/__tests__/lifecycle_regression.test.ts  (9 tests) 11ms
✓ src/domain/__tests__/payment_readiness.test.ts    (11 tests) 14ms
✓ src/lib/__tests__/config_regression.test.ts        (3 tests)  7ms

Test Files  3 passed (3)
     Tests  23 passed (23)
  Duration  1.37s
```

---

## Pre-existing Type Errors Fixed

Four Bolt.new-generated type errors were corrected as a prerequisite:

| File | Error | Fix |
|------|-------|-----|
| `src/domain/validation.ts:105` | String indexing on `Record<ScenarioLabel, number>` | Cast to `Record<string, number>` at access site |
| `src/lib/seed.ts:10` | `GeneratedDataset` imported from `@/domain/types` | Re-exported from `@/domain/generator` where it is declared |
| `src/pages/ApprovalInboxPage.tsx:6` | `InvoiceDetail` imported from `@/domain/types` | Moved to `@/lib/queries` where it is declared |
| `ApprovalInboxPage.tsx:116,118` | `e` in filter/map callbacks implicitly `any` | Resolved by fixing the `InvoiceDetail` import |

---

## Files Modified

| File | Change Type |
|------|-------------|
| `src/lib/queries.ts` | Added `fetchPaidInvoices`, updated `resolveException`, `markPaymentPaid` |
| `src/pages/PaymentReadinessPage.tsx` | Replaced crashing query; added "Recently Paid" section |
| `src/domain/lifecycle.ts` | Added `ExceptionResolutionOutcome`, `evaluateExceptionResolution` |
| `src/lib/supabase.ts` | Added `isSupabaseConfigured`, safe fallback client init |
| `src/App.tsx` | Added unconfigured-Supabase guard and onboarding card |
| `src/domain/validation.ts` | Pre-existing type error: cast fix |
| `src/lib/seed.ts` | Pre-existing type error: import fix |
| `src/pages/ApprovalInboxPage.tsx` | Pre-existing type error: import fix |
| `package.json` | Added `"test": "vitest run"` and `"test:watch": "vitest"` scripts |

## Files Created

| File | Purpose |
|------|---------|
| `src/domain/__tests__/payment_readiness.test.ts` | Regression suite — payment readiness, schema safety |
| `src/domain/__tests__/lifecycle_regression.test.ts` | Regression suite — exception resolution lifecycle |
| `src/lib/__tests__/config_regression.test.ts` | Regression suite — Supabase config detection |
| `audit/PHASE1_FIX_REPORT.md` | This document |

---

## Limitations & Out-of-Scope

- No database schema was modified. All fixes are at the application layer.
- The production RLS design (Task 4 recommendations) is documented but **not applied**.
- The chunk size warning from Vite build (`> 500 kB`) is pre-existing and unrelated to Phase 1 changes.
- Document extraction pipeline, large-scale refactoring, and new features are **explicitly out of scope**.

---

## Recommended Phase 2 Tasks

1. **Apply production RLS policies** — remove `anon` write access, add user-scoped row ownership.
2. **Make audit tables append-only** at the DB level (triggers or policy removal of UPDATE/DELETE).
3. **Validate lifecycle transitions at DB level** with a Postgres trigger referencing `VALID_TRANSITIONS`.
4. **Code-split the app bundle** — Vite dynamic imports for page-level chunks.
5. **E2E tests** — Playwright tests for the full exception-resolve → approval-pending flow.
6. **Real document extraction** — wire the extraction pipeline to the `PENDING` invoice queue.
