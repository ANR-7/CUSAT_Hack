export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP';
export type BillingInterval = 'monthly' | 'quarterly' | 'yearly' | 'weekly';
export type CustomerStatus = 'active' | 'at_risk' | 'past_due' | 'churned' | 'archived';
export type PlanStatus = 'active' | 'inactive' | 'archived';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired';
export type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'overdue' | 'payment_failed' | 'void' | 'refunded';
export type PaymentStatus = 'pending' | 'captured' | 'failed' | 'refunded' | 'partially_refunded';
export type PaymentProvider = 'razorpay' | 'simulated_demo' | 'manual_record';
export type OrgRole = 'owner' | 'admin' | 'finance' | 'member' | 'viewer';

export interface NotificationPreferences {
  failed_payments: boolean;
  upcoming_renewals: boolean;
  overdue_invoices: boolean;
  new_subscriptions: boolean;
  cancellations: boolean;
  payment_confirmations: boolean;
  email_digest: boolean;
}

export interface Profile {
  id: string;
  email: string;
  password_hash?: string;
  full_name: string;
  avatar_url?: string;
  job_title: string;
  default_organization_id: string | null;
  notification_preferences: NotificationPreferences;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  business_type: string;
  currency: CurrencyCode;
  tax_rate: number;
  tax_id: string;
  billing_email: string;
  address: string;
  country: string;
  invoice_prefix: string;
  grace_period_days: number;
  auto_retry_failed_payments: boolean;
  onboarding_completed: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  organization_id: string;
  external_code: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  tax_id: string;
  billing_address: string;
  currency: CurrencyCode;
  status: CustomerStatus;
  risk_score: number;
  risk_reason: string;
  preferred_payment_method: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  currency: CurrencyCode;
  billing_interval: BillingInterval;
  trial_days: number;
  features: string[];
  status: PlanStatus;
  razorpay_plan_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  organization_id: string;
  customer_id: string;
  plan_id: string;
  code: string;
  status: SubscriptionStatus;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  currency: CurrencyCode;
  billing_interval: BillingInterval;
  mrr_amount: number;
  start_date: string;
  current_period_start: string;
  current_period_end: string;
  next_billing_date: string | null;
  trial_ends_at: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  cancel_at_period_end: boolean;
  cancellation_reason: string | null;
  razorpay_subscription_id?: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface Invoice {
  id: string;
  organization_id: string;
  customer_id: string;
  subscription_id: string | null;
  invoice_number: string;
  status: InvoiceStatus;
  currency: CurrencyCode;
  line_items: InvoiceLineItem[];
  subtotal: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  issue_date: string;
  due_date: string;
  paid_at: string | null;
  notes: string;
  razorpay_order_id?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethodRecord {
  id: string;
  organization_id: string;
  customer_id: string;
  type: 'card' | 'upi' | 'netbanking' | 'bank_transfer';
  provider: string;
  provider_token_id: string;
  brand?: string;
  last4?: string;
  upi_vpa_masked?: string;
  expiry_month?: number;
  expiry_year?: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  organization_id: string;
  customer_id: string;
  invoice_id: string | null;
  subscription_id: string | null;
  payment_number: string;
  amount: number;
  refunded_amount: number;
  currency: CurrencyCode;
  status: PaymentStatus;
  payment_method: string;
  provider: PaymentProvider;
  is_verified: boolean;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  failure_reason?: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageRecord {
  id: string;
  organization_id: string;
  subscription_id: string;
  customer_id: string;
  metric_name: string;
  quantity: number;
  recorded_at: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  organization_id: string;
  type: 'failed_payment' | 'upcoming_renewal' | 'overdue_invoice' | 'new_subscription' | 'cancellation' | 'payment_confirmation' | 'system';
  severity: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  entity_type?: string;
  entity_id?: string;
  dedup_key: string;
  is_read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  actor_id: string | null;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  ip_address: string;
  created_at: string;
}

export interface WebhookEvent {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  organization_id: string | null;
  payload: Record<string, unknown>;
  processed_at: string;
}

export interface DatabaseState {
  profiles: Profile[];
  organizations: Organization[];
  organization_members: OrganizationMember[];
  customers: Customer[];
  plans: Plan[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  payment_methods: PaymentMethodRecord[];
  payments: Payment[];
  usage_records: UsageRecord[];
  notifications: NotificationItem[];
  audit_logs: AuditLog[];
  webhook_events: WebhookEvent[];
}
