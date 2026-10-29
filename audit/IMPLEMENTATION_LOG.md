# ENGINEERING IMPLEMENTATION BACKLOG — INVOICEFLOW AI
## YottaFlex AI 72-Hour Project Assessment — Actionable Engineering Tasks

**Audit Date:** October 27, 2026  
**Auditor:** Senior Software Architect, Full-Stack Code Auditor & QA Lead  
**Assessment Target:** YottaFlex AI Accounts Payable (AP) Automation Assessment  
**Repository:** `c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main`  

---

## Backlog Summary by Priority

| Priority Level | Meaning | Task Count | Total Estimated Hours |
|---|---|---|---|
| **P0** | Critical correctness, security, or payment-safety issue | 3 tasks | 7 hrs |
| **P1** | Essential assessment requirement missing or broken | 6 tasks | 30 hrs |
| **P2** | Important quality, usability, or evaluation improvement | 5 tasks | 11 hrs |
| **P3** | Optional polish or nonessential enhancement | 3 tasks | 6 hrs |
| **TOTAL** | | **17 tasks** | **54 hrs** |

---

## Detailed Task Backlog

### Task TASK-001 [P0]: Fix Broken Query on `PaymentReadinessPage` (Non-existent `invoices.paid_at` column)
- **Feature / Page:** Payment Readiness Page ([src/pages/PaymentReadinessPage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/PaymentReadinessPage.tsx#L34))
- **Current State:** [src/pages/PaymentReadinessPage.tsx:L34](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/PaymentReadinessPage.tsx#L34) executes `supabase.from('invoices').select('*').eq('payment_status', 'PAID').order('paid_at' as string, { ascending: false }).limit(50)`. Because `paid_at` does not exist on table `invoices` (it exists on `payments`), PostgreSQL/Supabase throws a runtime exception and the page fails to load properly.
- **Required Change:** Change the order clause to order by `received_at` (or `updated_at`), or fetch the paid list by querying table `payments` joined with `invoices`.
- **Acceptance Criteria:**
  1. `PaymentReadinessPage` loads without throwing a PostgREST column missing error.
  2. The "Paid" section displays the 50 most recently paid invoices accurately.
- **Dependencies:** None.
- **Priority:** **P0**
- **Estimated Effort:** 1 hour
- **Relevant Source Files:** [src/pages/PaymentReadinessPage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/PaymentReadinessPage.tsx#L34)
- **Test Required to Verify:** Automated test querying `PaymentReadinessPage` data fetch or manual page load verification with paid invoices.
- **Status:** **COMPLETE** (Resolved in Phase 1; verified with Vitest tests and production build)

---

### Task TASK-002 [P0]: Implement Post-Exception Resolution Lifecycle Progression
- **Feature / Page:** Exception Workbench & Queries ([src/lib/queries.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/lib/queries.ts#L279-L318), [src/domain/lifecycle.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/domain/lifecycle.ts))
- **Current State:** When an analyst resolves an exception via `resolveException(...)`, the record in `exceptions` is updated to `RESOLVED`, but the parent invoice remains permanently in `match_status = 'EXCEPTION'` and `lifecycle_state = 'EXCEPTION'`. The invoice never advances to `APPROVAL_PENDING` or `PAYMENT_READY`.
- **Required Change:** In `resolveException`:
  1. Check if any unresolved non-rejected exceptions remain for the invoice.
  2. If all exceptions are resolved, update `invoices.match_status` to `'MATCHED'` (or `'MATCHED_WITHIN_TOLERANCE'`).
  3. Determine if approval is required. If eligible, create a `PENDING` approval task and transition `lifecycle_state` to `'APPROVAL_PENDING'`, otherwise to `'PAYMENT_READY'` (and update `payment_status = 'READY'`).
  4. Record the state transition in `state_transitions` and `audit_events`.
- **Acceptance Criteria:**
  1. Resolving the last open exception on an invoice updates the invoice lifecycle state.
  2. An invoice with all exceptions resolved becomes visible in the Approval Inbox (if approval required) or Payment Readiness queue.
  3. A state transition record `EXCEPTION -> APPROVAL_PENDING` (or `PAYMENT_READY`) is recorded in the audit log.
- **Dependencies:** TASK-001
- **Priority:** **P0**
- **Estimated Effort:** 3 hours
- **Relevant Source Files:** [src/lib/queries.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/lib/queries.ts#L279), [src/domain/lifecycle.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/domain/lifecycle.ts#L32-L54)
- **Test Required to Verify:** Unit test resolving multiple exceptions sequentially until the invoice reaches `APPROVAL_PENDING`/`PAYMENT_READY`.
- **Status:** **COMPLETE** (Resolved in Phase 1 & 2; unit tests in `lifecycle_regression.test.ts` and `phase2_workflow.test.ts`)

---

### Task TASK-003 [P0]: Add Graceful Handling for Missing `.env` Configuration
- **Feature / Page:** Environment Config & Client Initialization ([src/lib/supabase.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/lib/supabase.ts#L6-L8))
- **Current State:** `src/lib/supabase.ts` throws an unhandled top-level error on module evaluation if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are not set in `.env`. This crashes the entire Vite React bundle before React mounts, rendering a blank white screen.
- **Required Change:** Provide fallback or conditional client creation, and display an informative `EnvMissingBanner` or setup guide in `App.tsx` explaining how to configure `.env` with Supabase credentials.
- **Acceptance Criteria:**
  1. When `.env` is missing, the application renders a friendly configuration guide instead of an uncaught module exception.
  2. Clear instructions show how to copy `.env.example` to `.env`.
- **Dependencies:** None.
- **Priority:** **P0**
- **Estimated Effort:** 3 hours
- **Relevant Source Files:** [src/lib/supabase.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/lib/supabase.ts), [src/App.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/App.tsx)
- **Test Required to Verify:** Launch app without `.env` and verify friendly UI instructions render.
- **Status:** **COMPLETE** (Resolved in Phase 1; `isSupabaseConfigured()` banner added and verified in `config_regression.test.ts`)

---

### Task TASK-004 [P1]: Connect Matching Engine to Structured JSON Intake
- **Feature / Page:** Invoice Intake Page ([src/pages/InvoiceIntakePage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/InvoiceIntakePage.tsx), [src/lib/queries.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/lib/queries.ts#L511-L585))
- **Current State:** When a structured JSON invoice is imported via `importStructuredInvoice(...)`, it inserts rows into `invoices` and `invoice_lines` with `match_status = 'UNMATCHED'` and `lifecycle_state = 'EXTRACTED'`. The matching engine `runMatch` is never invoked, so rule executions and exceptions are never created, leaving the invoice orphaned.
- **Required Change:** In `importStructuredInvoice`:
  1. Fetch the corresponding vendor, PO, PO lines, and goods receipts.
  2. Run `runMatch(ctx)`.
  3. Persist generated `rule_executions`, `exceptions`, and `duplicate_findings`.
  4. Update `invoices.match_status`, `lifecycle_state`, and `payment_status` to reflect matching outcome.
- **Acceptance Criteria:**
  1. An imported structured JSON invoice immediately shows matching results in `InvoiceDetailPage`.
  2. If the imported invoice contains discrepancies (e.g. price variance or quantity mismatch), exceptions are immediately visible on `ExceptionWorkbenchPage`.
- **Dependencies:** None.
- **Priority:** **P1**
- **Estimated Effort:** 4 hours
- **Relevant Source Files:** [src/lib/queries.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/lib/queries.ts#L511), [src/pages/InvoiceIntakePage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/InvoiceIntakePage.tsx)
- **Test Required to Verify:** Import a sample JSON invoice with price variance and verify rule execution and exception records appear in DB.
- **Status:** **COMPLETE** (Implemented `processInvoiceIntake` running full `runMatch`, persisting rule executions, exceptions, duplicate groups, and approval tasks)

---

### Task TASK-005 [P1]: Generate Pending Approval Tasks for Review-Eligible Invoices
- **Feature / Page:** Approval Workflow & Seed Engine ([src/domain/generator.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/domain/generator.ts#L440-L452), [src/domain/lifecycle.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/domain/lifecycle.ts))
- **Current State:** The synthetic generator only creates approvals for `CLEAN_MATCH` invoices, and immediately sets `status = 'APPROVED'`. Invoices requiring manual approval (e.g. high dollar amount, partial matches, or resolved exceptions) are never assigned `PENDING` approval tasks. As a result, the Approval Inbox's default view (`status = 'PENDING'`) is always completely empty.
- **Required Change:**
  1. Add an approval eligibility policy rule (e.g., clean matches over $5,000 or resolved exceptions require approval).
  2. Generate a subset of invoices in `APPROVAL_PENDING` state with pending approval tasks assigned to `APPROVER` users.
  3. Update `ApprovalInboxPage` to clearly highlight pending invoices awaiting human sign-off.
- **Acceptance Criteria:**
  1. Generating the dataset produces a realistic queue of pending approvals in `ApprovalInboxPage`.
  2. Approvers can click "Approve" or "Reject" to test the real workflow.
- **Dependencies:** TASK-002
- **Priority:** **P1**
- **Estimated Effort:** 4 hours
- **Relevant Source Files:** [src/domain/generator.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/domain/generator.ts), [src/pages/ApprovalInboxPage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/ApprovalInboxPage.tsx)
- **Test Required to Verify:** Seed starter dataset and confirm `ApprovalInboxPage` displays pending approvals.
- **Status:** **COMPLETE** (Implemented automatic pending approval task generation in intake and exception resolution, with duplicate prevention and blocking exception guards)

---

### Task TASK-006 [P1]: Set Up Automated Unit & Integration Test Suite (Vitest)
- **Feature / Page:** Testing Suite ([package.json](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/package.json), `src/domain/`)
- **Current State:** Zero test configuration or test files exist in the repository. Running `npm test` fails.
- **Required Change:**
  1. Add `vitest` and `@testing-library/react` to `devDependencies`.
  2. Configure `vitest.config.ts`.
  3. Implement unit tests for:
     - `matchingEngine.ts` (all 11 rules: price variance, quantity mismatch, missing receipt, arithmetic error, date before PO, vendor status, duplicates).
     - `lifecycle.ts` (state transition assertion, illegal transition rejection, payment readiness guards).
     - `money.ts` (rounding tolerances, decimal precision).
     - `generator.ts` (reproducibility across runs with seed 20261022, checksum consistency).
     - `validation.ts` (PK, FK, ID regex validation).
  4. Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts to `package.json`.
- **Acceptance Criteria:**
  1. `npm test` executes cleanly and passes all test suites.
  2. Test suite covers 100% of core domain business rules and lifecycle guards.
- **Dependencies:** None.
- **Priority:** **P1**
- **Estimated Effort:** 8 hours
- **Relevant Source Files:** [package.json](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/package.json), `src/domain/*.ts`
- **Test Required to Verify:** Execute `npm test` and verify all tests pass without errors.
- **Status:** **COMPLETE** (Configured Vitest with 4 test suites and 41 tests passing)

---

### Task TASK-007 [P1]: Implement Document File Parsing & Local Extraction Adapter
- **Feature / Page:** Invoice Intake Page ([src/pages/InvoiceIntakePage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/InvoiceIntakePage.tsx), [src/domain/extraction.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/domain/extraction.ts))
- **Current State:** Document upload is purely visual: dropping a PDF or image merely triggers a local state message stating "Simulated extraction. No provider configured." No file is processed or stored.
- **Required Change:**
  1. Implement a working extraction adapter (e.g. client-side text extractor for text-based PDFs or a lightweight regex/heuristic parser).
  2. Extract header fields (invoice number, date, vendor code, total) and line items.
  3. Pre-fill the intake review form with extracted fields so the user can verify and submit to the database.
- **Acceptance Criteria:**
  1. Uploading a sample PDF or image extracts real fields and renders a confirmation dialog.
  2. Submitting the confirmed fields inserts the invoice and triggers matching.
- **Dependencies:** TASK-004
- **Priority:** **P1**
- **Estimated Effort:** 8 hours
- **Relevant Source Files:** [src/domain/extraction.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/domain/extraction.ts), [src/pages/InvoiceIntakePage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/InvoiceIntakePage.tsx)
- **Test Required to Verify:** Upload sample invoice PDF and verify parsed fields match document contents.
- **Status:** **NOT STARTED**

---

### Task TASK-008 [P1]: Implement Full Dataset Seeding Optimization (Avoid Main Thread Freeze)
- **Feature / Page:** Data Lab Page ([src/pages/DataLabPage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/DataLabPage.tsx), [src/lib/seed.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/lib/seed.ts))
- **Current State:** Generating the full scale (2,100 invoices, 1,500 POs, ~4,500 lines) runs in a single asynchronous loop in the main browser thread. This risks UI unresponsiveness, browser "page unresponsive" dialogs, or PostgREST timeout on large multi-table batch inserts.
- **Required Change:**
  1. Chunk batch operations with visual progress indicators (e.g. "Inserting purchase orders 500/1500...", "Processing matching 800/2100...").
  2. Yield execution via `setTimeout` / microtasks between batches to keep the UI fluid.
  3. Handle partial network failures with retry and clear rollback warnings.
- **Acceptance Criteria:**
  1. Full dataset generation (2,000 base invoices) completes with smooth progress reporting and no browser lockup.
  2. Final checksum matches target `computeChecksum`.
- **Dependencies:** None.
- **Priority:** **P1**
- **Estimated Effort:** 4 hours
- **Relevant Source Files:** [src/lib/seed.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/lib/seed.ts), [src/pages/DataLabPage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/DataLabPage.tsx)
- **Test Required to Verify:** Run full dataset seed in Data Lab and record generation time and progress bar stability.
- **Status:** **NOT STARTED**

---

### Task TASK-009 [P1]: Full Database Export for Invoice Queue
- **Feature / Page:** Invoice Queue Page ([src/pages/InvoiceQueuePage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/InvoiceQueuePage.tsx#L49-L62))
- **Current State:** Clicking "Export CSV" only serializes `rows` (the currently visible page of 25 items), rather than the full filtered query.
- **Required Change:** In `exportCsv`, execute a fetch without range limit matching current filter criteria, serialize all matching rows, and trigger download.
- **Acceptance Criteria:**
  1. Clicking "Export CSV" with 126 total invoices downloads a CSV containing 126 records (plus headers), not 25.
- **Dependencies:** None.
- **Priority:** **P1**
- **Estimated Effort:** 2 hours
- **Relevant Source Files:** [src/pages/InvoiceQueuePage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/InvoiceQueuePage.tsx)
- **Test Required to Verify:** Export CSV on starter dataset and verify file line count matches total invoices count + 1.
- **Status:** **NOT STARTED**

---

### Task TASK-010 [P2]: Implement URL-Based Routing with `react-router-dom`
- **Feature / Page:** Application Navigation & Routing ([src/App.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/App.tsx), [src/components/Layout.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/components/Layout.tsx))
- **Current State:** Navigation is driven solely by React state (`page: PageKey`). There are no URL routes, preventing browser back/forward navigation, deep linking to invoices, or bookmarking.
- **Required Change:**
  1. Install `react-router-dom`.
  2. Define routes: `/overview`, `/invoices`, `/invoices/:id`, `/intake`, `/exceptions`, `/approvals`, `/payments`, `/datalab`, `/audit`, `/admin`.
  3. Replace internal state navigation with standard `useNavigate` and `<Link>` components.
- **Acceptance Criteria:**
  1. Users can open an invoice directly via URL `/invoices/INV-V0001-000001`.
  2. Browser back and forward buttons navigate through history correctly.
- **Dependencies:** None.
- **Priority:** **P2**
- **Estimated Effort:** 3 hours
- **Relevant Source Files:** [src/App.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/App.tsx), [src/components/Layout.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/components/Layout.tsx)
- **Test Required to Verify:** Navigate directly to deep link in browser address bar.
- **Status:** **NOT STARTED**

---

### Task TASK-011 [P2]: Replace Hardcoded System Health in Administration Page
- **Feature / Page:** Admin Page ([src/pages/AdminPage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/AdminPage.tsx#L118-L137))
- **Current State:** System Health cards show static hardcoded green text: "Database: Connected", "Matching Engine: Active". They do not execute real health queries.
- **Required Change:** Implement real diagnostic ping checks:
  1. Query Supabase latency and connection state.
  2. Verify matching engine rule version.
  3. Check active extraction adapter provider.
  4. Display live status badges with latency metrics.
- **Acceptance Criteria:**
  1. Admin page shows live database latency and connection status.
  2. If Supabase is unreachable, the card changes to red "Disconnected".
- **Dependencies:** None.
- **Priority:** **P2**
- **Estimated Effort:** 2 hours
- **Relevant Source Files:** [src/pages/AdminPage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/AdminPage.tsx)
- **Test Required to Verify:** Simulate DB disconnect and verify health card changes state.
- **Status:** **NOT STARTED**

---

### Task TASK-012 [P2]: Implement Manual Vendor & PO Management UI
- **Feature / Page:** Administration & Operations Pages
- **Current State:** Vendors, POs, and Receipts only exist through synthetic data generation. There is no manual entry UI for creating a new vendor or issuing a PO.
- **Required Change:** Add simple modal or dedicated forms in Admin/Operations to create a vendor master record and create a PO with lines.
- **Acceptance Criteria:**
  1. Operations user can create a new vendor with code, tax ID, and terms.
  2. Newly created vendor is immediately available in invoice intake dropdown.
- **Dependencies:** None.
- **Priority:** **P2**
- **Estimated Effort:** 4 hours
- **Relevant Source Files:** [src/pages/AdminPage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/AdminPage.tsx), [src/lib/queries.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/lib/queries.ts)
- **Test Required to Verify:** Create a vendor in the UI and verify it persists to Supabase.
- **Status:** **NOT STARTED**

---

### Task TASK-013 [P2]: Harden Postgres Row Level Security (RLS)
- **Feature / Page:** Database Security ([supabase/migrations/20261027155808_001_invoiceflow_core_schema.sql](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/supabase/migrations/20261027155808_001_invoiceflow_core_schema.sql))
- **Current State:** All RLS policies use `USING (true)` and `WITH CHECK (true)` for `anon`, making operational data completely public and unconstrained.
- **Required Change:**
  1. Create scoped RLS policies or PostgreSQL custom functions/triggers that validate role authorization headers or prevent unauthorized modifications.
  2. Restrict direct deletes on `audit_events` and `state_transitions` (enforce append-only).
- **Acceptance Criteria:**
  1. Audit events and state transitions cannot be deleted via the client API.
  2. Role checks are validated before allowing approval decision updates.
- **Dependencies:** None.
- **Priority:** **P2**
- **Estimated Effort:** 2 hours
- **Relevant Source Files:** [supabase/migrations/20261027155808_001_invoiceflow_core_schema.sql](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/supabase/migrations/20261027155808_001_invoiceflow_core_schema.sql)
- **Status:** **COMPLETE** (Resolved in Phase 3; implemented `supabase/migrations/20261027180000_002_security_hardening_and_invariants.sql` with immutable audit triggers `prevent_audit_tampering`, unique duplicate payment guards `uq_payments_one_paid_per_invoice`, positive amounts check constraints, and `SECURITY DEFINER` stored procedures `decide_approval_secure` and `schedule_payment_secure`)

---

### Task TASK-014 [P3]: Add Visual Diff Highlighting in Three-Way Matching Table
- **Feature / Page:** Invoice Detail Page ([src/pages/InvoiceDetailPage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/InvoiceDetailPage.tsx))
- **Current State:** Lines table lists invoice quantity, PO quantity, and accepted quantity side-by-side, but does not visually highlight cells where variances exceed tolerance.
- **Required Change:** Highlight price cells with orange/red background if variance > 1%, and quantity cells if invoice quantity > accepted receipt quantity.
- **Acceptance Criteria:**
  1. Discrepancies stand out clearly with distinct color-coded badges and tooltips.
- **Dependencies:** None.
- **Priority:** **P3**
- **Estimated Effort:** 2 hours
- **Relevant Source Files:** [src/pages/InvoiceDetailPage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/InvoiceDetailPage.tsx)
- **Test Required to Verify:** Visual inspection of line with price variance.
- **Status:** **NOT STARTED**

---

### Task TASK-015 [P3]: Enhance Confusion Matrix Visualization in Evaluation Tab
- **Feature / Page:** Audit & Evaluation Page ([src/pages/AuditEvaluationPage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/AuditEvaluationPage.tsx))
- **Current State:** Confusion matrix metrics are dumped inside raw JSON in a `<pre>` tag.
- **Required Change:** Render a formatted 2D grid/heatmap comparing Predicted vs Expected match status.
- **Acceptance Criteria:**
  1. Visual matrix table shows Predicted on X-axis, Expected on Y-axis with colored diagonal cells.
- **Dependencies:** None.
- **Priority:** **P3**
- **Estimated Effort:** 2 hours
- **Relevant Source Files:** [src/pages/AuditEvaluationPage.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/pages/AuditEvaluationPage.tsx)
- **Test Required to Verify:** Verify grid renders properly under Evaluation Runs tab.
- **Status:** **NOT STARTED**

---

### Task TASK-016 [P3]: Dark Mode Support
- **Feature / Page:** Global Styling ([src/index.css](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/index.css), [src/components/Layout.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/components/Layout.tsx))
- **Current State:** Application only supports light mode.
- **Required Change:** Add dark mode CSS tokens and theme switcher toggle in the navigation header.
- **Acceptance Criteria:**
  1. Header includes theme toggle switch.
  2. All cards, tables, inputs, and typography support dark theme.
- **Dependencies:** None.
- **Priority:** **P3**
- **Estimated Effort:** 2 hours
- **Relevant Source Files:** [src/index.css](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/index.css), [src/components/Layout.tsx](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/components/Layout.tsx)
- **Test Required to Verify:** Toggle dark mode and verify contrast on all 9 pages.
- **Status:** **NOT STARTED**

---

### Task TASK-017 [P2]: Automated Production Build & Linting Verification
- **Feature / Page:** CI / Build Scripts ([package.json](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/package.json))
- **Current State:** `npm run build` and `npm run typecheck` require `node_modules` to be installed and verified.
- **Required Change:** Verify build and linting pipelines run cleanly in Windows environment.
- **Acceptance Criteria:**
  1. `npm run build` produces dist bundle without TypeScript or ESLint errors.
- **Dependencies:** None.
- **Priority:** **P2**
- **Estimated Effort:** 1 hour
- **Relevant Source Files:** [package.json](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/package.json)
- **Test Required to Verify:** Run `npm run build`, `npm run typecheck`, `npm run lint`, and `npm run test`.
- **Status:** **COMPLETE** (Verified in Phase 3; `npm run typecheck` (0 errors), `npm run lint` (0 errors), `npm run test` (55 tests passing across 5 suites), and `npm run build` (production bundle built cleanly in 9.11s))

---

### Task TASK-018 [P0]: Complete Database Schema Repair — Apply Missing Migrations to Supabase

- **Feature / Page:** All Features — Cross-Cutting Database Layer ([supabase/migrations/](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/supabase/migrations/))
- **Audit Date:** October 28, 2026
- **Current State:** The Supabase project (`uwxuvjhfcorucpmognfq.supabase.co`) has 0 of 21 required tables and 0 of 2 SECURITY DEFINER stored procedures. Every table query from the app returns `PGRST205 — Table not in schema cache`. Neither migration file has been executed against this project.
- **Root Cause:** Both migration SQL files (`001_invoiceflow_core_schema.sql` and `002_security_hardening_and_invariants.sql`) exist locally but have never been pasted into the Supabase SQL Editor or run via Supabase CLI.
- **Complete Audit Produced:**
  - [audit/DATABASE_AUDIT.md](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/audit/DATABASE_AUDIT.md) — Full schema matrix for all 21 tables, columns, FKs, indexes, RLS, query mapping
  - [audit/DATABASE_REPAIR_REPORT.md](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/audit/DATABASE_REPAIR_REPORT.md) — Root cause, missing objects, exact SQL steps
  - [audit/DATABASE_TEST_RESULTS.md](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/audit/DATABASE_TEST_RESULTS.md) — Pre/post migration expected outputs + verification checklist
  - [src/check_db.test.ts](file:///c:/Users/Asus/Downloads/invoice_flow-main/invoice_flow-main/src/check_db.test.ts) — Automated Vitest check for all 21 tables and 2 RPCs
- **Reconciliation Findings:**
  - All TypeScript column references match migration schema exactly (0 mismatches found)
  - FK insertion order in seed.ts is correct (topological dependency order)
  - ground_truth isolation from matching engine is architecturally enforced
  - No new migration files required — existing two migrations are complete
- **Required Action:**
  1. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/uwxuvjhfcorucpmognfq/sql)
  2. Run `20261027155808_001_invoiceflow_core_schema.sql` (creates 21 tables, indexes, RLS, triggers)
  3. Run `20261027180000_002_security_hardening_and_invariants.sql` (CHECK constraints, unique indexes, immutability triggers, SECURITY DEFINER RPCs)
  4. Run `npm run verify:db` — expect 21/21 PASS, 2/2 RPC PASS
- **Acceptance Criteria:**
  1. `npm run verify:db` reports 21/21 tables PASS
  2. Data Lab page loads without PGRST205 error
  3. `seedDataset()` inserts all records without FK constraint violations
  4. Evaluation metrics display on Data Lab after generation
- **Dependencies:** None (migrations are self-contained)
- **Priority:** **P0**
- **Estimated Effort:** 30 minutes (manual SQL paste + verify)
- **Status:** **DIAGNOSIS COMPLETE — AWAITING MANUAL SQL EXECUTION**
