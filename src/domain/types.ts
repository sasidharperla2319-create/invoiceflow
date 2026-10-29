// Core domain types for InvoiceFlow AI

export type VendorStatus = 'ACTIVE' | 'ON_HOLD' | 'CLOSED';
export type POStatus = 'DRAFT' | 'OPEN' | 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED' | 'CLOSED' | 'CANCELLED';
export type ExtractionStatus = 'PENDING' | 'EXTRACTED' | 'EXTRACTION_FAILED' | 'SIMULATED';
export type ValidationStatus = 'PENDING' | 'VALIDATED' | 'VALIDATION_FAILED';
export type MatchStatus =
  | 'UNMATCHED'
  | 'MATCHED'
  | 'MATCHED_WITHIN_TOLERANCE'
  | 'PARTIAL_MATCH'
  | 'EXCEPTION'
  | 'BLOCKED'
  | 'PENDING_REVIEW';
export type ApprovalStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'BLOCKED';
export type PaymentStatus = 'NOT_READY' | 'READY' | 'SCHEDULED' | 'PAID' | 'FAILED' | 'NOT_APPLICABLE';
export type LifecycleState =
  | 'RECEIVED'
  | 'EXTRACTED'
  | 'VALIDATED'
  | 'MATCHED'
  | 'EXCEPTION'
  | 'APPROVAL_PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'BLOCKED'
  | 'ON_HOLD'
  | 'PAYMENT_READY'
  | 'PAYMENT_SCHEDULED'
  | 'PAID'
  | 'PAYMENT_FAILED';

export type ExceptionSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKING';
export type ExceptionStatus = 'OPEN' | 'ASSIGNED' | 'RESOLVED' | 'REJECTED';
export type ApprovalDecision = 'PENDING' | 'APPROVED' | 'REJECTED';
export type PaymentState = 'SCHEDULED' | 'PAID' | 'FAILED';
export type UserRole =
  | 'BUSINESS_REQUESTER'
  | 'PROCESS_OWNER'
  | 'APPROVER'
  | 'OPERATIONS_ANALYST'
  | 'SYSTEM_ADMIN';

export type ScenarioLabel =
  | 'CLEAN_MATCH'
  | 'PRICE_VARIANCE'
  | 'QUANTITY_MISMATCH'
  | 'DUPLICATE_INVOICE'
  | 'MISSING_RECEIPT'
  | 'TAX_OR_VENDOR_ERROR';

export interface Vendor {
  vendor_id: string;
  vendor_code: string;
  legal_name: string;
  tax_identifier: string;
  currency: string;
  payment_terms_days: number;
  status: VendorStatus;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  purchase_order_id: string;
  po_number: string;
  vendor_id: string;
  po_date: string;
  expected_delivery_date: string | null;
  currency: string;
  status: POStatus;
  created_at: string;
}

export interface PurchaseOrderLine {
  po_line_id: string;
  purchase_order_id: string;
  line_number: number;
  sku: string;
  description: string;
  ordered_quantity: number;
  unit_price: number;
  tax_code: string;
  tax_rate: number;
  unit_of_measure: string;
}

export interface GoodsReceipt {
  goods_receipt_id: string;
  receipt_number: string;
  purchase_order_id: string;
  receipt_date: string;
  status: string;
  created_at: string;
}

export interface GoodsReceiptLine {
  receipt_line_id: string;
  goods_receipt_id: string;
  po_line_id: string;
  received_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  created_at: string;
}

export interface Invoice {
  invoice_id: string;
  invoice_number: string;
  vendor_id: string;
  purchase_order_id: string | null;
  invoice_date: string;
  received_at: string;
  due_date: string;
  currency: string;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  extracted_fields_json: Record<string, unknown> | null;
  extraction_confidence: number;
  extraction_status: ExtractionStatus;
  validation_status: ValidationStatus;
  match_status: MatchStatus;
  approval_status: ApprovalStatus;
  payment_status: PaymentStatus;
  lifecycle_state: LifecycleState;
  source_document_ref: string | null;
  scenario_label: ScenarioLabel | null;
  duplicate_group_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLine {
  invoice_line_id: string;
  invoice_id: string;
  line_number: number;
  sku: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_code: string;
  tax_rate: number;
  line_subtotal: number;
  line_tax: number;
  line_total: number;
  po_line_id: string | null;
}

export interface Approval {
  approval_id: string;
  invoice_id: string;
  approver_user_id: string | null;
  approval_level: number;
  status: ApprovalDecision;
  assigned_at: string;
  decided_at: string | null;
  decision_reason: string | null;
  comments: string | null;
}

export interface Payment {
  payment_id: string;
  invoice_id: string;
  payment_reference: string;
  amount: number;
  currency: string;
  status: PaymentState;
  scheduled_at: string;
  paid_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface ExceptionFinding {
  exception_id: string;
  invoice_id: string;
  rule_id: string;
  rule_version: string;
  issue_type: string;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  observed_value: string | null;
  expected_value: string | null;
  tolerance: string | null;
  difference: string | null;
  explanation: string;
  routed_to_role: UserRole | null;
  assigned_to_user_id: string | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface DuplicateFinding {
  duplicate_id: string;
  duplicate_group_id: string;
  invoice_id_a: string;
  invoice_id_b: string;
  reason: string;
  normalized_key: string | null;
  created_at: string;
}

export interface AuditEvent {
  audit_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_user_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface StateTransition {
  transition_id: string;
  invoice_id: string;
  from_state: LifecycleState;
  to_state: LifecycleState;
  reason: string | null;
  actor_user_id: string | null;
  created_at: string;
}

export interface ExtractionAttempt {
  attempt_id: string;
  invoice_id: string;
  provider: string;
  status: string;
  confidence: number | null;
  extracted_json: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export interface ConfigSetting {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

export interface GenerationManifest {
  manifest_id: string;
  seed: string;
  scale: string;
  row_counts: Record<string, number>;
  scenario_counts: Record<string, number>;
  checksum: string | null;
  generated_at: string;
}

export interface EvaluationRun {
  run_id: string;
  seed: string | null;
  scale: string | null;
  started_at: string;
  completed_at: string | null;
  metrics: Record<string, unknown> | null;
  summary: Record<string, unknown> | null;
  status: string;
}

export interface GroundTruth {
  invoice_id: string;
  scenario_label: ScenarioLabel;
  expected_match_outcome: MatchStatus;
  expected_exception_codes: string[];
  expected_duplicate_group: string | null;
  expected_approval_eligible: boolean;
  expected_payment_ready: boolean;
  expected_payment_outcome: string | null;
  notes: string | null;
}

export interface RuleExecution {
  execution_id: string;
  invoice_id: string;
  processing_run_id: string;
  rule_id: string;
  rule_version: string;
  result: string;
  observed_value: string | null;
  expected_value: string | null;
  tolerance: string | null;
  difference: string | null;
  explanation: string;
  created_at: string;
}

export interface User {
  user_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface ExceptionAssignment {
  assignment_id: string;
  exception_id: string;
  assigned_by: string | null;
  assigned_to: string | null;
  action: string;
  notes: string | null;
  created_at: string;
}

// Matching engine types
export interface RuleResult {
  rule_id: string;
  rule_version: string;
  result: 'PASS' | 'FAIL' | 'WARN' | 'SKIPPED' | 'MATCHED' | 'MATCHED_WITHIN_TOLERANCE' | 'PARTIAL_MATCH' | 'EXCEPTION' | 'BLOCKED' | 'PENDING_REVIEW';
  observed_value: string | null;
  expected_value: string | null;
  tolerance: string | null;
  difference: string | null;
  explanation: string;
  severity: ExceptionSeverity;
  issue_type: string | null;
  routed_to_role: UserRole | null;
}

export interface MatchContext {
  invoice: Invoice;
  invoiceLines: InvoiceLine[];
  vendor: Vendor | null;
  po: PurchaseOrder | null;
  poLines: PurchaseOrderLine[];
  receipts: GoodsReceipt[];
  receiptLines: GoodsReceiptLine[];
  allInvoices: Invoice[];
  config: MatchConfig;
}

export interface MatchConfig {
  price_abs_tolerance: number;
  price_pct_tolerance: number;
  quantity_tolerance_pct: number;
  rounding_tolerance: number;
  require_receipt: boolean;
  two_way_match_policy: 'ALLOW' | 'WARN';
  tax_codes: Record<string, number>;
}

export interface MatchOutcome {
  invoice_id: string;
  processing_run_id: string;
  overall_status: MatchStatus;
  results: RuleResult[];
  exceptions: RuleResult[];
  blocking: boolean;
}
