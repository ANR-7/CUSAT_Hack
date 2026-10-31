import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AuditLog,
  Customer,
  DatabaseState,
  Invoice,
  NotificationItem,
  Organization,
  OrganizationMember,
  Payment,
  PaymentMethodRecord,
  Plan,
  Profile,
  Subscription,
  UsageRecord,
} from './types.js';
import { calculateInvoiceTotals, calculateSubscriptionMrr, evaluateCustomerHealth } from './finance.js';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.Runtime.json');

export function hashPassword(password: string): string {
  const salt = 'revive_salt_v2_2026';
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  const computed = hashPassword(password);
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'revive-production-grade-secret-key-2026-cusat';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  exp: number;
}

export function signToken(userId: string, email: string): string {
  const payload: AuthTokenPayload = {
    sub: userId,
    email,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(base64Payload)
    .digest('base64url');
  return `${base64Payload}.${signature}`;
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [base64Payload, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(base64Payload)
      .digest('base64url');
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(base64Payload, 'base64url').toString('utf8')) as AuthTokenPayload;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  return (
    Boolean(url && key) &&
    !url.includes('your-project-id') &&
    !key.includes('your-supabase')
  );
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)!;
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function buildSeedDatabase(): DatabaseState {
  const org1Id = '11111111-1111-4111-8111-111111111111';
  const org2Id = '99999999-9999-4999-8999-999999999999';
  const demoUserId = '00000000-0000-4000-8000-000000000001';
  const otherUserId = '00000000-0000-4000-8000-000000000002';

  const profiles: Profile[] = [
    {
      id: demoUserId,
      email: 'aditya@brightloop.io',
      password_hash: hashPassword('ReviveDemo#2026'),
      full_name: 'Aditya Narayan',
      job_title: 'Founder & Head of Finance',
      default_organization_id: org1Id,
      notification_preferences: {
        failed_payments: true,
        upcoming_renewals: true,
        overdue_invoices: true,
        new_subscriptions: true,
        cancellations: true,
        payment_confirmations: true,
        email_digest: true,
      },
      created_at: '2026-01-10T09:00:00.000Z',
      updated_at: '2026-10-31T08:00:00.000Z',
    },
    {
      id: otherUserId,
      email: 'meera@apexcloud.io',
      password_hash: hashPassword('ApexSecret#2026'),
      full_name: 'Meera Krishnan',
      job_title: 'VP Operations',
      default_organization_id: org2Id,
      notification_preferences: {
        failed_payments: true,
        upcoming_renewals: true,
        overdue_invoices: true,
        new_subscriptions: true,
        cancellations: true,
        payment_confirmations: true,
        email_digest: false,
      },
      created_at: '2026-02-14T09:00:00.000Z',
      updated_at: '2026-10-30T08:00:00.000Z',
    },
  ];

  const organizations: Organization[] = [
    {
      id: org1Id,
      name: 'Brightloop Software',
      slug: 'brightloop-software',
      business_type: 'B2B SaaS',
      currency: 'INR',
      tax_rate: 18,
      tax_id: '29AABCB1234F1Z5',
      billing_email: 'billing@brightloop.io',
      address: '100 Feet Road, Indiranagar, Bengaluru, KA 560038',
      country: 'IN',
      invoice_prefix: 'INV',
      grace_period_days: 7,
      auto_retry_failed_payments: true,
      onboarding_completed: true,
      created_by: demoUserId,
      created_at: '2026-01-10T09:00:00.000Z',
      updated_at: '2026-10-31T08:00:00.000Z',
    },
    {
      id: org2Id,
      name: 'Apex Cloud Systems',
      slug: 'apex-cloud-systems',
      business_type: 'Cloud Infrastructure',
      currency: 'USD',
      tax_rate: 10,
      tax_id: 'US-EIN-98-120491',
      billing_email: 'finance@apexcloud.io',
      address: '548 Market St, San Francisco, CA 94104',
      country: 'US',
      invoice_prefix: 'APX',
      grace_period_days: 10,
      auto_retry_failed_payments: true,
      onboarding_completed: true,
      created_by: otherUserId,
      created_at: '2026-02-14T09:00:00.000Z',
      updated_at: '2026-10-30T08:00:00.000Z',
    },
  ];

  const organization_members: OrganizationMember[] = [
    {
      id: 'mem-1',
      organization_id: org1Id,
      user_id: demoUserId,
      role: 'owner',
      created_at: '2026-01-10T09:00:00.000Z',
      updated_at: '2026-01-10T09:00:00.000Z',
    },
    {
      id: 'mem-2',
      organization_id: org2Id,
      user_id: otherUserId,
      role: 'owner',
      created_at: '2026-02-14T09:00:00.000Z',
      updated_at: '2026-02-14T09:00:00.000Z',
    },
  ];

  const plans: Plan[] = [
    {
      id: 'plan-starter-01',
      organization_id: org1Id,
      code: 'PLN-01',
      name: 'Starter Monthly',
      description: 'Core subscription tracking, GST invoicing, and email alerts for growing teams.',
      price: 3900,
      currency: 'INR',
      billing_interval: 'monthly',
      trial_days: 14,
      features: [
        'Up to 250 active subscribers',
        'Automated GST-compliant PDF invoices',
        'Standard payment recovery emails',
        'CSV data exports',
      ],
      status: 'active',
      razorpay_plan_id: 'plan_test_starter_01',
      created_at: '2026-01-15T10:00:00.000Z',
      updated_at: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 'plan-pro-02',
      organization_id: org1Id,
      code: 'PLN-02',
      name: 'Pro Monthly',
      description: 'Advanced revenue analytics, smart dunning workflows, and priority support.',
      price: 8400,
      currency: 'INR',
      billing_interval: 'monthly',
      trial_days: 14,
      features: [
        'Up to 2,000 active subscribers',
        'Cohort retention & churn intelligence',
        'Automated Razorpay webhook reconciliation',
        'Priority engineering support',
      ],
      status: 'active',
      razorpay_plan_id: 'plan_test_pro_02',
      created_at: '2026-01-15T10:00:00.000Z',
      updated_at: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 'plan-growth-03',
      organization_id: org1Id,
      code: 'PLN-03',
      name: 'Growth Monthly',
      description: 'Full AI Revenue Copilot, multi-seat team access, and deterministic scenario planning.',
      price: 15800,
      currency: 'INR',
      billing_interval: 'monthly',
      trial_days: 14,
      features: [
        'Unlimited subscribers & custom plans',
        'OpenAI Revenue Copilot & risk scoring',
        'Deterministic 12-month scenario simulator',
        'Dedicated account manager',
      ],
      status: 'active',
      razorpay_plan_id: 'plan_test_growth_03',
      created_at: '2026-01-15T10:00:00.000Z',
      updated_at: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 'plan-scale-04',
      organization_id: org1Id,
      code: 'PLN-04',
      name: 'Scale Annual',
      description: 'Enterprise annual commitment with custom SLAs, audit logs, and multi-entity billing.',
      price: 288000,
      currency: 'INR',
      billing_interval: 'yearly',
      trial_days: 30,
      features: [
        'Annual billing (₹24,000/mo equivalent)',
        'Full audit trail & RBAC security',
        'Custom ERP & webhook integrations',
        '99.99% uptime SLA guarantee',
      ],
      status: 'active',
      razorpay_plan_id: 'plan_test_scale_04',
      created_at: '2026-01-15T10:00:00.000Z',
      updated_at: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 'plan-quarterly-05',
      organization_id: org1Id,
      code: 'PLN-05',
      name: 'Growth Quarterly',
      description: 'Quarterly billing package for mid-market teams with 10% built-in savings.',
      price: 42600,
      currency: 'INR',
      billing_interval: 'quarterly',
      trial_days: 14,
      features: [
        'Quarterly billing (₹14,200/mo equivalent)',
        'AI Revenue Copilot included',
        'Automated quarterly business reviews',
      ],
      status: 'active',
      razorpay_plan_id: 'plan_test_quarterly_05',
      created_at: '2026-03-01T10:00:00.000Z',
      updated_at: '2026-09-01T10:00:00.000Z',
    },
    // Second tenant plan for isolation testing
    {
      id: 'plan-apex-01',
      organization_id: org2Id,
      code: 'APX-01',
      name: 'Apex Enterprise Cluster',
      description: 'Dedicated Kubernetes cluster management.',
      price: 2500,
      currency: 'USD',
      billing_interval: 'monthly',
      trial_days: 14,
      features: ['Dedicated cluster', '24/7 NOC'],
      status: 'active',
      created_at: '2026-02-14T10:00:00.000Z',
      updated_at: '2026-02-14T10:00:00.000Z',
    },
  ];

  const customers: Customer[] = [
    {
      id: 'cus-northstar-1042',
      organization_id: org1Id,
      external_code: 'CUS-1042',
      name: 'Northstar Studio',
      email: 'finance@northstar.io',
      phone: '+91 98201 44102',
      company: 'Northstar Digital Studio Pvt Ltd',
      tax_id: '27AAACN1042D1Z1',
      billing_address: '402 Linking Road, Bandra West, Mumbai, MH 400050',
      currency: 'INR',
      status: 'at_risk',
      risk_score: 86,
      risk_reason: '2 failed payment attempts on Scale Annual renewal',
      preferred_payment_method: 'Card',
      notes: 'High-value design agency. Card limit exceeded twice; CFO requested link for retry.',
      created_at: '2026-03-12T10:00:00.000Z',
      updated_at: '2026-10-29T14:20:00.000Z',
    },
    {
      id: 'cus-morrow-1041',
      organization_id: org1Id,
      external_code: 'CUS-1041',
      name: 'Morrow & Co.',
      email: 'ops@morrow.co',
      phone: '+91 98450 22910',
      company: 'Morrow Strategy Partners LLP',
      tax_id: '29AABCM1041E1Z5',
      billing_address: 'Prestige Trade Tower, Palace Road, Bengaluru, KA 560001',
      currency: 'INR',
      status: 'active',
      risk_score: 12,
      risk_reason: 'Healthy account',
      preferred_payment_method: 'UPI',
      notes: 'Auto-debit via UPI mandate active.',
      created_at: '2026-04-02T11:30:00.000Z',
      updated_at: '2026-10-28T09:15:00.000Z',
    },
    {
      id: 'cus-pixelforge-1039',
      organization_id: org1Id,
      external_code: 'CUS-1039',
      name: 'PixelForge',
      email: 'billing@pixelforge.dev',
      phone: '+91 90001 88312',
      company: 'PixelForge Gaming Technologies Pvt Ltd',
      tax_id: '36AAACP1039H1Z9',
      billing_address: 'Raheja Mindspace, HITEC City, Hyderabad, TS 500081',
      currency: 'INR',
      status: 'past_due',
      risk_score: 74,
      risk_reason: 'Invoice INV-2079 overdue by 25 days',
      preferred_payment_method: 'Card',
      notes: 'AP team switched corporate cards in October.',
      created_at: '2026-04-19T08:45:00.000Z',
      updated_at: '2026-10-26T16:00:00.000Z',
    },
    {
      id: 'cus-cedar-1038',
      organization_id: org1Id,
      external_code: 'CUS-1038',
      name: 'Cedar Labs',
      email: 'accounts@cedarlabs.in',
      phone: '+91 98111 77409',
      company: 'Cedar BioLabs India Ltd',
      tax_id: '07AAACC1038B1Z2',
      billing_address: 'Barakhamba Road, Connaught Place, New Delhi, DL 110001',
      currency: 'INR',
      status: 'active',
      risk_score: 8,
      risk_reason: 'Healthy account',
      preferred_payment_method: 'Bank transfer',
      notes: 'Enterprise multi-seat customer with 2 Scale Annual licenses.',
      created_at: '2026-02-20T10:00:00.000Z',
      updated_at: '2026-10-25T11:00:00.000Z',
    },
    {
      id: 'cus-bluebird-1035',
      organization_id: org1Id,
      external_code: 'CUS-1035',
      name: 'Bluebird Fitness',
      email: 'hello@bluebird.fit',
      phone: '+91 98804 51209',
      company: 'Bluebird Wellness Studios Pvt Ltd',
      tax_id: '29AAACB1035K1Z8',
      billing_address: 'Koramangala 4th Block, Bengaluru, KA 560034',
      currency: 'INR',
      status: 'at_risk',
      risk_score: 64,
      risk_reason: 'Upcoming renewal in 2 days; usage dropped 18%',
      preferred_payment_method: 'UPI',
      notes: 'Check in before Nov 2 renewal.',
      created_at: '2026-05-10T10:00:00.000Z',
      updated_at: '2026-10-29T10:00:00.000Z',
    },
    {
      id: 'cus-orbit-1031',
      organization_id: org1Id,
      external_code: 'CUS-1031',
      name: 'Orbit Learning',
      email: 'admin@orbitlearn.in',
      phone: '+91 97400 99123',
      company: 'Orbit EdTech Solutions Pvt Ltd',
      tax_id: '33AAACO1031P1Z4',
      billing_address: 'OMR Road, Taramani, Chennai, TN 600113',
      currency: 'INR',
      status: 'past_due',
      risk_score: 91,
      risk_reason: 'Payment failed on high-value Growth subscription; 23 days overdue',
      preferred_payment_method: 'Card',
      notes: 'Escalated to customer success lead.',
      created_at: '2026-05-22T14:00:00.000Z',
      updated_at: '2026-10-28T17:00:00.000Z',
    },
    {
      id: 'cus-kindred-1028',
      organization_id: org1Id,
      external_code: 'CUS-1028',
      name: 'Kindred Works',
      email: 'team@kindred.works',
      phone: '+91 98230 66541',
      company: 'Kindred Creative Collective',
      tax_id: '27AAACK1028M1Z3',
      billing_address: 'Baner Road, Pune, MH 411045',
      currency: 'INR',
      status: 'active',
      risk_score: 10,
      risk_reason: 'Healthy account',
      preferred_payment_method: 'UPI',
      notes: 'Upgraded to Pro Monthly in August.',
      created_at: '2026-06-01T09:00:00.000Z',
      updated_at: '2026-10-27T12:00:00.000Z',
    },
    {
      id: 'cus-verve-1024',
      organization_id: org1Id,
      external_code: 'CUS-1024',
      name: 'Verve Logistics',
      email: 'billing@vervelogistics.in',
      phone: '+91 98104 33219',
      company: 'Verve Supply Chain Tech Pvt Ltd',
      tax_id: '06AAACV1024L1Z7',
      billing_address: 'Cyber City, DLF Phase 2, Gurugram, HR 122002',
      currency: 'INR',
      status: 'active',
      risk_score: 14,
      risk_reason: 'Healthy account',
      preferred_payment_method: 'Bank transfer',
      notes: 'Quarterly billing customer.',
      created_at: '2026-06-18T11:00:00.000Z',
      updated_at: '2026-10-15T10:00:00.000Z',
    },
    {
      id: 'cus-solaris-1019',
      organization_id: org1Id,
      external_code: 'CUS-1019',
      name: 'Solaris Energy AI',
      email: 'finance@solaris.ai',
      phone: '+91 99001 77890',
      company: 'Solaris Grid Analytics Pvt Ltd',
      tax_id: '29AAACS1019Q1Z2',
      billing_address: 'Whitefield Main Road, Bengaluru, KA 560066',
      currency: 'INR',
      status: 'active',
      risk_score: 15,
      risk_reason: 'In 14-day free trial (high engagement)',
      preferred_payment_method: 'Card',
      notes: 'Evaluating Growth Monthly for 3 seats.',
      created_at: '2026-10-22T09:30:00.000Z',
      updated_at: '2026-10-30T10:00:00.000Z',
    },
    // Second organization customer (for tenant isolation test)
    {
      id: 'cus-apex-9001',
      organization_id: org2Id,
      external_code: 'APX-C01',
      name: 'GlobalFin Corp',
      email: 'ap@globalfin.com',
      phone: '+1 415 890 2211',
      company: 'GlobalFin Holdings Inc.',
      tax_id: 'US-88-192011',
      billing_address: '100 Wall St, New York, NY 10005',
      currency: 'USD',
      status: 'active',
      risk_score: 5,
      risk_reason: 'Healthy account',
      preferred_payment_method: 'Card',
      notes: 'Isolated tenant customer.',
      created_at: '2026-03-01T10:00:00.000Z',
      updated_at: '2026-10-01T10:00:00.000Z',
    },
  ];

  const subscriptions: Subscription[] = [
    {
      id: 'sub-401',
      organization_id: org1Id,
      customer_id: 'cus-northstar-1042',
      plan_id: 'plan-scale-04',
      code: 'SUB-0401',
      status: 'past_due',
      quantity: 1,
      unit_price: 288000,
      discount_percent: 0,
      currency: 'INR',
      billing_interval: 'yearly',
      mrr_amount: calculateSubscriptionMrr(288000, 1, 'yearly', 0), // 24,000
      start_date: '2025-10-29T00:00:00.000Z',
      current_period_start: '2026-10-29T00:00:00.000Z',
      current_period_end: '2027-10-29T00:00:00.000Z',
      next_billing_date: '2026-11-05T00:00:00.000Z',
      trial_ends_at: null,
      paused_at: null,
      cancelled_at: null,
      cancel_at_period_end: false,
      cancellation_reason: null,
      razorpay_subscription_id: 'sub_test_northstar_401',
      created_at: '2025-10-29T00:00:00.000Z',
      updated_at: '2026-10-29T14:20:00.000Z',
    },
    {
      id: 'sub-402',
      organization_id: org1Id,
      customer_id: 'cus-morrow-1041',
      plan_id: 'plan-growth-03',
      code: 'SUB-0402',
      status: 'active',
      quantity: 1,
      unit_price: 15800,
      discount_percent: 0,
      currency: 'INR',
      billing_interval: 'monthly',
      mrr_amount: calculateSubscriptionMrr(15800, 1, 'monthly', 0), // 15,800
      start_date: '2026-04-28T00:00:00.000Z',
      current_period_start: '2026-10-28T00:00:00.000Z',
      current_period_end: '2026-11-28T00:00:00.000Z',
      next_billing_date: '2026-11-28T00:00:00.000Z',
      trial_ends_at: null,
      paused_at: null,
      cancelled_at: null,
      cancel_at_period_end: false,
      cancellation_reason: null,
      razorpay_subscription_id: 'sub_test_morrow_402',
      created_at: '2026-04-28T00:00:00.000Z',
      updated_at: '2026-10-28T09:15:00.000Z',
    },
    {
      id: 'sub-403',
      organization_id: org1Id,
      customer_id: 'cus-pixelforge-1039',
      plan_id: 'plan-pro-02',
      code: 'SUB-0403',
      status: 'past_due',
      quantity: 1,
      unit_price: 8400,
      discount_percent: 0,
      currency: 'INR',
      billing_interval: 'monthly',
      mrr_amount: calculateSubscriptionMrr(8400, 1, 'monthly', 0), // 8,400
      start_date: '2026-04-29T00:00:00.000Z',
      current_period_start: '2026-09-29T00:00:00.000Z',
      current_period_end: '2026-10-29T00:00:00.000Z',
      next_billing_date: '2026-11-03T00:00:00.000Z',
      trial_ends_at: null,
      paused_at: null,
      cancelled_at: null,
      cancel_at_period_end: false,
      cancellation_reason: null,
      razorpay_subscription_id: 'sub_test_pixelforge_403',
      created_at: '2026-04-29T00:00:00.000Z',
      updated_at: '2026-10-26T16:00:00.000Z',
    },
    {
      id: 'sub-404',
      organization_id: org1Id,
      customer_id: 'cus-cedar-1038',
      plan_id: 'plan-scale-04',
      code: 'SUB-0404',
      status: 'active',
      quantity: 2,
      unit_price: 288000,
      discount_percent: 10,
      currency: 'INR',
      billing_interval: 'yearly',
      mrr_amount: calculateSubscriptionMrr(288000, 2, 'yearly', 10), // 43,200
      start_date: '2026-02-25T00:00:00.000Z',
      current_period_start: '2026-02-25T00:00:00.000Z',
      current_period_end: '2027-02-25T00:00:00.000Z',
      next_billing_date: '2027-02-25T00:00:00.000Z',
      trial_ends_at: null,
      paused_at: null,
      cancelled_at: null,
      cancel_at_period_end: false,
      cancellation_reason: null,
      razorpay_subscription_id: 'sub_test_cedar_404',
      created_at: '2026-02-25T00:00:00.000Z',
      updated_at: '2026-10-25T11:00:00.000Z',
    },
    {
      id: 'sub-405',
      organization_id: org1Id,
      customer_id: 'cus-bluebird-1035',
      plan_id: 'plan-starter-01',
      code: 'SUB-0405',
      status: 'active',
      quantity: 1,
      unit_price: 3900,
      discount_percent: 0,
      currency: 'INR',
      billing_interval: 'monthly',
      mrr_amount: calculateSubscriptionMrr(3900, 1, 'monthly', 0), // 3,900
      start_date: '2026-05-02T00:00:00.000Z',
      current_period_start: '2026-10-02T00:00:00.000Z',
      current_period_end: '2026-11-02T00:00:00.000Z',
      next_billing_date: '2026-11-02T00:00:00.000Z',
      trial_ends_at: null,
      paused_at: null,
      cancelled_at: null,
      cancel_at_period_end: false,
      cancellation_reason: null,
      razorpay_subscription_id: 'sub_test_bluebird_405',
      created_at: '2026-05-02T00:00:00.000Z',
      updated_at: '2026-10-02T10:00:00.000Z',
    },
    {
      id: 'sub-406',
      organization_id: org1Id,
      customer_id: 'cus-orbit-1031',
      plan_id: 'plan-growth-03',
      code: 'SUB-0406',
      status: 'past_due',
      quantity: 1,
      unit_price: 15800,
      discount_percent: 0,
      currency: 'INR',
      billing_interval: 'monthly',
      mrr_amount: calculateSubscriptionMrr(15800, 1, 'monthly', 0), // 15,800
      start_date: '2026-06-01T00:00:00.000Z',
      current_period_start: '2026-10-01T00:00:00.000Z',
      current_period_end: '2026-11-01T00:00:00.000Z',
      next_billing_date: '2026-11-01T00:00:00.000Z',
      trial_ends_at: null,
      paused_at: null,
      cancelled_at: null,
      cancel_at_period_end: false,
      cancellation_reason: null,
      razorpay_subscription_id: 'sub_test_orbit_406',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-10-08T10:00:00.000Z',
    },
    {
      id: 'sub-407',
      organization_id: org1Id,
      customer_id: 'cus-kindred-1028',
      plan_id: 'plan-pro-02',
      code: 'SUB-0407',
      status: 'active',
      quantity: 2,
      unit_price: 8400,
      discount_percent: 0,
      currency: 'INR',
      billing_interval: 'monthly',
      mrr_amount: calculateSubscriptionMrr(8400, 2, 'monthly', 0), // 16,800
      start_date: '2026-06-27T00:00:00.000Z',
      current_period_start: '2026-10-27T00:00:00.000Z',
      current_period_end: '2026-11-27T00:00:00.000Z',
      next_billing_date: '2026-11-27T00:00:00.000Z',
      trial_ends_at: null,
      paused_at: null,
      cancelled_at: null,
      cancel_at_period_end: false,
      cancellation_reason: null,
      razorpay_subscription_id: 'sub_test_kindred_407',
      created_at: '2026-06-27T00:00:00.000Z',
      updated_at: '2026-10-27T12:00:00.000Z',
    },
    {
      id: 'sub-408',
      organization_id: org1Id,
      customer_id: 'cus-verve-1024',
      plan_id: 'plan-quarterly-05',
      code: 'SUB-0408',
      status: 'active',
      quantity: 1,
      unit_price: 42600,
      discount_percent: 0,
      currency: 'INR',
      billing_interval: 'quarterly',
      mrr_amount: calculateSubscriptionMrr(42600, 1, 'quarterly', 0), // 14,200
      start_date: '2026-07-15T00:00:00.000Z',
      current_period_start: '2026-10-15T00:00:00.000Z',
      current_period_end: '2027-01-15T00:00:00.000Z',
      next_billing_date: '2027-01-15T00:00:00.000Z',
      trial_ends_at: null,
      paused_at: null,
      cancelled_at: null,
      cancel_at_period_end: false,
      cancellation_reason: null,
      razorpay_subscription_id: 'sub_test_verve_408',
      created_at: '2026-07-15T00:00:00.000Z',
      updated_at: '2026-10-15T10:00:00.000Z',
    },
    {
      id: 'sub-409',
      organization_id: org1Id,
      customer_id: 'cus-solaris-1019',
      plan_id: 'plan-growth-03',
      code: 'SUB-0409',
      status: 'trialing',
      quantity: 2,
      unit_price: 15800,
      discount_percent: 0,
      currency: 'INR',
      billing_interval: 'monthly',
      mrr_amount: calculateSubscriptionMrr(15800, 2, 'monthly', 0), // 31,600
      start_date: '2026-10-22T00:00:00.000Z',
      current_period_start: '2026-10-22T00:00:00.000Z',
      current_period_end: '2026-11-05T00:00:00.000Z',
      next_billing_date: '2026-11-05T00:00:00.000Z',
      trial_ends_at: '2026-11-05T00:00:00.000Z',
      paused_at: null,
      cancelled_at: null,
      cancel_at_period_end: false,
      cancellation_reason: null,
      created_at: '2026-10-22T00:00:00.000Z',
      updated_at: '2026-10-22T00:00:00.000Z',
    },
    // Second tenant subscription
    {
      id: 'sub-apex-901',
      organization_id: org2Id,
      customer_id: 'cus-apex-9001',
      plan_id: 'plan-apex-01',
      code: 'APX-SUB-01',
      status: 'active',
      quantity: 1,
      unit_price: 2500,
      discount_percent: 0,
      currency: 'USD',
      billing_interval: 'monthly',
      mrr_amount: 2500,
      start_date: '2026-03-01T00:00:00.000Z',
      current_period_start: '2026-10-01T00:00:00.000Z',
      current_period_end: '2026-11-01T00:00:00.000Z',
      next_billing_date: '2026-11-01T00:00:00.000Z',
      trial_ends_at: null,
      paused_at: null,
      cancelled_at: null,
      cancel_at_period_end: false,
      cancellation_reason: null,
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    },
  ];

  const makeInv = (
    id: string,
    invoice_number: string,
    customer_id: string,
    subscription_id: string | null,
    status: Invoice['status'],
    description: string,
    qty: number,
    unit_price: number,
    discount: number,
    issue_date: string,
    due_date: string,
    paid_at: string | null,
    notes: string
  ): Invoice => {
    const calc = calculateInvoiceTotals(
      [{ id: `${id}-line-1`, description, quantity: qty, unit_price }],
      discount,
      18
    );
    return {
      id,
      organization_id: org1Id,
      customer_id,
      subscription_id,
      invoice_number,
      status,
      currency: 'INR',
      line_items: calc.normalizedItems,
      subtotal: calc.subtotal,
      discount_amount: calc.discount_amount,
      tax_rate: calc.tax_rate,
      tax_amount: calc.tax_amount,
      total_amount: calc.total_amount,
      issue_date,
      due_date,
      paid_at,
      notes,
      created_at: issue_date,
      updated_at: paid_at || issue_date,
    };
  };

  const invoices: Invoice[] = [
    makeInv(
      'inv-2084',
      'INV-2084',
      'cus-northstar-1042',
      'sub-401',
      'payment_failed',
      'Scale Annual Subscription (Monthly Installment)',
      1,
      24000,
      0,
      '2026-10-29T09:00:00.000Z',
      '2026-11-05T09:00:00.000Z',
      null,
      'Auto-charge declined twice by issuer bank (insufficient daily card limit).'
    ),
    makeInv(
      'inv-2081',
      'INV-2081',
      'cus-orbit-1031',
      'sub-406',
      'overdue',
      'Growth Monthly Subscription — October 2026',
      1,
      15800,
      0,
      '2026-10-01T09:00:00.000Z',
      '2026-10-08T09:00:00.000Z',
      null,
      'Overdue by 23 days. Dunning reminder stage 2.'
    ),
    makeInv(
      'inv-2079',
      'INV-2079',
      'cus-pixelforge-1039',
      'sub-403',
      'overdue',
      'Pro Monthly Subscription — October 2026',
      1,
      8400,
      0,
      '2026-09-29T09:00:00.000Z',
      '2026-10-06T09:00:00.000Z',
      null,
      'Overdue by 25 days. Customer updating corporate card.'
    ),
    makeInv(
      'inv-2076',
      'INV-2076',
      'cus-morrow-1041',
      'sub-402',
      'paid',
      'Growth Monthly Subscription — October 2026',
      1,
      15800,
      0,
      '2026-10-28T09:00:00.000Z',
      '2026-11-04T09:00:00.000Z',
      '2026-10-28T09:05:00.000Z',
      'Paid via UPI AutoPay mandate.'
    ),
    makeInv(
      'inv-2075',
      'INV-2075',
      'cus-kindred-1028',
      'sub-407',
      'paid',
      'Pro Monthly Subscription (2 Seats) — October 2026',
      2,
      8400,
      0,
      '2026-10-27T09:00:00.000Z',
      '2026-11-03T09:00:00.000Z',
      '2026-10-27T09:12:00.000Z',
      'Paid via UPI.'
    ),
    makeInv(
      'inv-2074',
      'INV-2074',
      'cus-cedar-1038',
      'sub-404',
      'paid',
      'Scale Annual Enterprise Allocation — October 2026',
      2,
      24000,
      4800,
      '2026-10-25T09:00:00.000Z',
      '2026-11-01T09:00:00.000Z',
      '2026-10-25T14:10:00.000Z',
      'Settled via NEFT/RTGS bank transfer.'
    ),
    makeInv(
      'inv-2073',
      'INV-2073',
      'cus-verve-1024',
      'sub-408',
      'paid',
      'Growth Quarterly Subscription (Q4 2026)',
      1,
      42600,
      0,
      '2026-10-15T09:00:00.000Z',
      '2026-10-22T09:00:00.000Z',
      '2026-10-15T11:30:00.000Z',
      'Quarterly billing settled on issue date.'
    ),
    makeInv(
      'inv-2072',
      'INV-2072',
      'cus-bluebird-1035',
      'sub-405',
      'pending',
      'Starter Monthly Subscription — November 2026 Renewal',
      1,
      3900,
      0,
      '2026-10-29T09:00:00.000Z',
      '2026-11-02T09:00:00.000Z',
      null,
      'Upcoming renewal due on Nov 2, 2026.'
    ),
    // Historical paid invoices across May - September 2026 for real historical charts
    makeInv(
      'inv-2060',
      'INV-2060',
      'cus-cedar-1038',
      'sub-404',
      'paid',
      'Enterprise Platform Subscription — September 2026',
      1,
      92000,
      0,
      '2026-09-15T09:00:00.000Z',
      '2026-09-22T09:00:00.000Z',
      '2026-09-15T12:00:00.000Z',
      'September cycle paid.'
    ),
    makeInv(
      'inv-2050',
      'INV-2050',
      'cus-cedar-1038',
      'sub-404',
      'paid',
      'Enterprise Platform Subscription — August 2026',
      1,
      84000,
      0,
      '2026-08-15T09:00:00.000Z',
      '2026-08-22T09:00:00.000Z',
      '2026-08-15T12:00:00.000Z',
      'August cycle paid.'
    ),
    makeInv(
      'inv-2040',
      'INV-2040',
      'cus-morrow-1041',
      'sub-402',
      'paid',
      'Subscription Services — July 2026',
      1,
      74000,
      0,
      '2026-07-15T09:00:00.000Z',
      '2026-07-22T09:00:00.000Z',
      '2026-07-15T12:00:00.000Z',
      'July cycle paid.'
    ),
    makeInv(
      'inv-2030',
      'INV-2030',
      'cus-morrow-1041',
      'sub-402',
      'paid',
      'Subscription Services — June 2026',
      1,
      68000,
      0,
      '2026-06-15T09:00:00.000Z',
      '2026-06-22T09:00:00.000Z',
      '2026-06-15T12:00:00.000Z',
      'June cycle paid.'
    ),
    makeInv(
      'inv-2020',
      'INV-2020',
      'cus-cedar-1038',
      'sub-404',
      'paid',
      'Subscription Services — May 2026',
      1,
      61000,
      0,
      '2026-05-15T09:00:00.000Z',
      '2026-05-22T09:00:00.000Z',
      '2026-05-15T12:00:00.000Z',
      'May cycle paid.'
    ),
  ];

  const payments: Payment[] = [
    {
      id: 'pay-7001',
      organization_id: org1Id,
      customer_id: 'cus-morrow-1041',
      invoice_id: 'inv-2076',
      subscription_id: 'sub-402',
      payment_number: 'PAY-7001',
      amount: invoices.find((i) => i.id === 'inv-2076')!.total_amount,
      refunded_amount: 0,
      currency: 'INR',
      status: 'captured',
      payment_method: 'UPI',
      provider: 'razorpay',
      is_verified: true,
      razorpay_order_id: 'order_test_morrow_2076',
      razorpay_payment_id: 'pay_test_morrow_2076',
      paid_at: '2026-10-28T09:05:00.000Z',
      created_at: '2026-10-28T09:05:00.000Z',
      updated_at: '2026-10-28T09:05:00.000Z',
    },
    {
      id: 'pay-7002',
      organization_id: org1Id,
      customer_id: 'cus-kindred-1028',
      invoice_id: 'inv-2075',
      subscription_id: 'sub-407',
      payment_number: 'PAY-7002',
      amount: invoices.find((i) => i.id === 'inv-2075')!.total_amount,
      refunded_amount: 0,
      currency: 'INR',
      status: 'captured',
      payment_method: 'UPI',
      provider: 'razorpay',
      is_verified: true,
      razorpay_order_id: 'order_test_kindred_2075',
      razorpay_payment_id: 'pay_test_kindred_2075',
      paid_at: '2026-10-27T09:12:00.000Z',
      created_at: '2026-10-27T09:12:00.000Z',
      updated_at: '2026-10-27T09:12:00.000Z',
    },
    {
      id: 'pay-7003',
      organization_id: org1Id,
      customer_id: 'cus-cedar-1038',
      invoice_id: 'inv-2074',
      subscription_id: 'sub-404',
      payment_number: 'PAY-7003',
      amount: invoices.find((i) => i.id === 'inv-2074')!.total_amount,
      refunded_amount: 0,
      currency: 'INR',
      status: 'captured',
      payment_method: 'Bank transfer',
      provider: 'razorpay',
      is_verified: true,
      razorpay_order_id: 'order_test_cedar_2074',
      razorpay_payment_id: 'pay_test_cedar_2074',
      paid_at: '2026-10-25T14:10:00.000Z',
      created_at: '2026-10-25T14:10:00.000Z',
      updated_at: '2026-10-25T14:10:00.000Z',
    },
    {
      id: 'pay-7004',
      organization_id: org1Id,
      customer_id: 'cus-verve-1024',
      invoice_id: 'inv-2073',
      subscription_id: 'sub-408',
      payment_number: 'PAY-7004',
      amount: invoices.find((i) => i.id === 'inv-2073')!.total_amount,
      refunded_amount: 0,
      currency: 'INR',
      status: 'captured',
      payment_method: 'Bank transfer',
      provider: 'razorpay',
      is_verified: true,
      razorpay_order_id: 'order_test_verve_2073',
      razorpay_payment_id: 'pay_test_verve_2073',
      paid_at: '2026-10-15T11:30:00.000Z',
      created_at: '2026-10-15T11:30:00.000Z',
      updated_at: '2026-10-15T11:30:00.000Z',
    },
    {
      id: 'pay-7005',
      organization_id: org1Id,
      customer_id: 'cus-northstar-1042',
      invoice_id: 'inv-2084',
      subscription_id: 'sub-401',
      payment_number: 'PAY-7005',
      amount: invoices.find((i) => i.id === 'inv-2084')!.total_amount,
      refunded_amount: 0,
      currency: 'INR',
      status: 'failed',
      payment_method: 'Card',
      provider: 'razorpay',
      is_verified: false,
      razorpay_order_id: 'order_test_northstar_2084',
      failure_reason: 'BAD_REQUEST_ERROR: Card transaction limit exceeded on corporate Visa ending 4242',
      paid_at: null,
      created_at: '2026-10-29T09:15:00.000Z',
      updated_at: '2026-10-29T09:15:00.000Z',
    },
    // Historical captured payments
    {
      id: 'pay-6990',
      organization_id: org1Id,
      customer_id: 'cus-cedar-1038',
      invoice_id: 'inv-2060',
      subscription_id: 'sub-404',
      payment_number: 'PAY-6990',
      amount: invoices.find((i) => i.id === 'inv-2060')!.total_amount,
      refunded_amount: 0,
      currency: 'INR',
      status: 'captured',
      payment_method: 'Bank transfer',
      provider: 'razorpay',
      is_verified: true,
      paid_at: '2026-09-15T12:00:00.000Z',
      created_at: '2026-09-15T12:00:00.000Z',
      updated_at: '2026-09-15T12:00:00.000Z',
    },
    {
      id: 'pay-6980',
      organization_id: org1Id,
      customer_id: 'cus-cedar-1038',
      invoice_id: 'inv-2050',
      subscription_id: 'sub-404',
      payment_number: 'PAY-6980',
      amount: invoices.find((i) => i.id === 'inv-2050')!.total_amount,
      refunded_amount: 0,
      currency: 'INR',
      status: 'captured',
      payment_method: 'Bank transfer',
      provider: 'razorpay',
      is_verified: true,
      paid_at: '2026-08-15T12:00:00.000Z',
      created_at: '2026-08-15T12:00:00.000Z',
      updated_at: '2026-08-15T12:00:00.000Z',
    },
    {
      id: 'pay-6970',
      organization_id: org1Id,
      customer_id: 'cus-morrow-1041',
      invoice_id: 'inv-2040',
      subscription_id: 'sub-402',
      payment_number: 'PAY-6970',
      amount: invoices.find((i) => i.id === 'inv-2040')!.total_amount,
      refunded_amount: 0,
      currency: 'INR',
      status: 'captured',
      payment_method: 'UPI',
      provider: 'razorpay',
      is_verified: true,
      paid_at: '2026-07-15T12:00:00.000Z',
      created_at: '2026-07-15T12:00:00.000Z',
      updated_at: '2026-07-15T12:00:00.000Z',
    },
    {
      id: 'pay-6960',
      organization_id: org1Id,
      customer_id: 'cus-morrow-1041',
      invoice_id: 'inv-2030',
      subscription_id: 'sub-402',
      payment_number: 'PAY-6960',
      amount: invoices.find((i) => i.id === 'inv-2030')!.total_amount,
      refunded_amount: 0,
      currency: 'INR',
      status: 'captured',
      payment_method: 'UPI',
      provider: 'razorpay',
      is_verified: true,
      paid_at: '2026-06-15T12:00:00.000Z',
      created_at: '2026-06-15T12:00:00.000Z',
      updated_at: '2026-06-15T12:00:00.000Z',
    },
    {
      id: 'pay-6950',
      organization_id: org1Id,
      customer_id: 'cus-cedar-1038',
      invoice_id: 'inv-2020',
      subscription_id: 'sub-404',
      payment_number: 'PAY-6950',
      amount: invoices.find((i) => i.id === 'inv-2020')!.total_amount,
      refunded_amount: 0,
      currency: 'INR',
      status: 'captured',
      payment_method: 'Bank transfer',
      provider: 'razorpay',
      is_verified: true,
      paid_at: '2026-05-15T12:00:00.000Z',
      created_at: '2026-05-15T12:00:00.000Z',
      updated_at: '2026-05-15T12:00:00.000Z',
    },
  ];

  const payment_methods: PaymentMethodRecord[] = [
    {
      id: 'pm-1',
      organization_id: org1Id,
      customer_id: 'cus-northstar-1042',
      type: 'card',
      provider: 'razorpay',
      provider_token_id: 'token_rzp_northstar_4242',
      brand: 'Visa Corporate',
      last4: '4242',
      expiry_month: 8,
      expiry_year: 2028,
      is_default: true,
      created_at: '2026-03-12T10:00:00.000Z',
      updated_at: '2026-03-12T10:00:00.000Z',
    },
    {
      id: 'pm-2',
      organization_id: org1Id,
      customer_id: 'cus-morrow-1041',
      type: 'upi',
      provider: 'razorpay',
      provider_token_id: 'token_rzp_morrow_upi',
      upi_vpa_masked: 'morrow.ops@okhdfcbank',
      is_default: true,
      created_at: '2026-04-02T11:30:00.000Z',
      updated_at: '2026-04-02T11:30:00.000Z',
    },
  ];

  const usage_records: UsageRecord[] = [
    {
      id: 'use-1',
      organization_id: org1Id,
      subscription_id: 'sub-404',
      customer_id: 'cus-cedar-1038',
      metric_name: 'API Events Processed',
      quantity: 48200,
      recorded_at: '2026-10-30T10:00:00.000Z',
      created_at: '2026-10-30T10:00:00.000Z',
    },
    {
      id: 'use-2',
      organization_id: org1Id,
      subscription_id: 'sub-402',
      customer_id: 'cus-morrow-1041',
      metric_name: 'Active Seat Licenses',
      quantity: 18,
      recorded_at: '2026-10-30T10:00:00.000Z',
      created_at: '2026-10-30T10:00:00.000Z',
    },
  ];

  const notifications: NotificationItem[] = [
    {
      id: 'notif-1',
      organization_id: org1Id,
      type: 'failed_payment',
      severity: 'critical',
      title: 'Payment failed for Northstar Studio',
      message: 'Invoice INV-2084 (₹28,320 incl. GST) failed on Visa ending 4242. Retry or send checkout link.',
      entity_type: 'invoice',
      entity_id: 'inv-2084',
      dedup_key: 'failed_payment:inv-2084',
      is_read: false,
      created_at: '2026-10-29T09:16:00.000Z',
    },
    {
      id: 'notif-2',
      organization_id: org1Id,
      type: 'overdue_invoice',
      severity: 'warning',
      title: 'Orbit Learning invoice INV-2081 is overdue',
      message: '₹18,644 (incl. GST) is 23 days past due date. Automated dunning stage 2 triggered.',
      entity_type: 'invoice',
      entity_id: 'inv-2081',
      dedup_key: 'overdue_invoice:inv-2081',
      is_read: false,
      created_at: '2026-10-28T10:00:00.000Z',
    },
    {
      id: 'notif-3',
      organization_id: org1Id,
      type: 'overdue_invoice',
      severity: 'warning',
      title: 'PixelForge invoice INV-2079 is overdue',
      message: '₹9,912 (incl. GST) is 25 days overdue. Customer requested payment link.',
      entity_type: 'invoice',
      entity_id: 'inv-2079',
      dedup_key: 'overdue_invoice:inv-2079',
      is_read: false,
      created_at: '2026-10-27T11:00:00.000Z',
    },
    {
      id: 'notif-4',
      organization_id: org1Id,
      type: 'upcoming_renewal',
      severity: 'info',
      title: 'Bluebird Fitness renews in 2 days',
      message: 'Subscription SUB-0405 (Starter Monthly · ₹3,900/mo) renews on Nov 2, 2026.',
      entity_type: 'subscription',
      entity_id: 'sub-405',
      dedup_key: 'upcoming_renewal:sub-405:2026-11-02',
      is_read: false,
      created_at: '2026-10-30T08:00:00.000Z',
    },
    {
      id: 'notif-5',
      organization_id: org1Id,
      type: 'payment_confirmation',
      severity: 'success',
      title: 'Payment captured from Morrow & Co.',
      message: 'Received ₹18,644 via UPI AutoPay for invoice INV-2076.',
      entity_type: 'payment',
      entity_id: 'pay-7001',
      dedup_key: 'payment_confirmation:pay-7001',
      is_read: true,
      created_at: '2026-10-28T09:05:00.000Z',
    },
  ];

  const audit_logs: AuditLog[] = [
    {
      id: 'audit-1',
      organization_id: org1Id,
      actor_id: demoUserId,
      actor_email: 'aditya@brightloop.io',
      action: 'payment.failed',
      entity_type: 'invoice',
      entity_id: 'INV-2084',
      metadata: { reason: 'Card limit exceeded', amount: 28320 },
      ip_address: '103.21.124.18',
      created_at: '2026-10-29T09:15:00.000Z',
    },
    {
      id: 'audit-2',
      organization_id: org1Id,
      actor_id: demoUserId,
      actor_email: 'aditya@brightloop.io',
      action: 'payment.captured',
      entity_type: 'payment',
      entity_id: 'PAY-7001',
      metadata: { invoice: 'INV-2076', method: 'UPI', amount: 18644 },
      ip_address: '103.21.124.18',
      created_at: '2026-10-28T09:05:00.000Z',
    },
  ];

  return {
    profiles,
    organizations,
    organization_members,
    customers,
    plans,
    subscriptions,
    invoices,
    payment_methods,
    payments,
    usage_records,
    notifications,
    audit_logs,
    webhook_events: [],
  };
}

class DataStore {
  private state: DatabaseState;

  constructor() {
    this.state = this.loadFromDisk();
  }

  private loadFromDisk(): DatabaseState {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw) as DatabaseState;
        if (parsed && Array.isArray(parsed.organizations) && Array.isArray(parsed.customers)) {
          return parsed;
        }
      }
    } catch {
      // Fallback to fresh seed if corrupted
    }
    const seed = buildSeedDatabase();
    this.saveToDisk(seed);
    return seed;
  }

  private saveToDisk(state: DatabaseState = this.state): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch {
      // Ignore write error in read-only environments
    }
  }

  public getState(): DatabaseState {
    return this.state;
  }

  public commit(): void {
    this.saveToDisk(this.state);
  }

  public resetOrganizationDemoData(organizationId: string, userId: string): void {
    const seed = buildSeedDatabase();
    const defaultOrgId = '11111111-1111-4111-8111-111111111111';

    // Replace records for this organization with fresh seeded copies mapped to organizationId
    this.state.customers = this.state.customers.filter((c) => c.organization_id !== organizationId);
    this.state.plans = this.state.plans.filter((p) => p.organization_id !== organizationId);
    this.state.subscriptions = this.state.subscriptions.filter((s) => s.organization_id !== organizationId);
    this.state.invoices = this.state.invoices.filter((i) => i.organization_id !== organizationId);
    this.state.payments = this.state.payments.filter((p) => p.organization_id !== organizationId);
    this.state.payment_methods = this.state.payment_methods.filter((pm) => pm.organization_id !== organizationId);
    this.state.usage_records = this.state.usage_records.filter((u) => u.organization_id !== organizationId);
    this.state.notifications = this.state.notifications.filter((n) => n.organization_id !== organizationId);
    this.state.audit_logs = this.state.audit_logs.filter((a) => a.organization_id !== organizationId);

    const mapId = (id: string) =>
      organizationId === defaultOrgId ? id : `${id}-${organizationId.slice(0, 6)}`;

    seed.plans
      .filter((p) => p.organization_id === defaultOrgId)
      .forEach((p) => {
        this.state.plans.push({ ...p, id: mapId(p.id), organization_id: organizationId });
      });

    seed.customers
      .filter((c) => c.organization_id === defaultOrgId)
      .forEach((c) => {
        this.state.customers.push({ ...c, id: mapId(c.id), organization_id: organizationId });
      });

    seed.subscriptions
      .filter((s) => s.organization_id === defaultOrgId)
      .forEach((s) => {
        this.state.subscriptions.push({
          ...s,
          id: mapId(s.id),
          organization_id: organizationId,
          customer_id: mapId(s.customer_id),
          plan_id: mapId(s.plan_id),
        });
      });

    seed.invoices
      .filter((i) => i.organization_id === defaultOrgId)
      .forEach((i) => {
        this.state.invoices.push({
          ...i,
          id: mapId(i.id),
          organization_id: organizationId,
          customer_id: mapId(i.customer_id),
          subscription_id: i.subscription_id ? mapId(i.subscription_id) : null,
        });
      });

    seed.payments
      .filter((p) => p.organization_id === defaultOrgId)
      .forEach((p) => {
        this.state.payments.push({
          ...p,
          id: mapId(p.id),
          organization_id: organizationId,
          customer_id: mapId(p.customer_id),
          invoice_id: p.invoice_id ? mapId(p.invoice_id) : null,
          subscription_id: p.subscription_id ? mapId(p.subscription_id) : null,
        });
      });

    seed.payment_methods
      .filter((pm) => pm.organization_id === defaultOrgId)
      .forEach((pm) => {
        this.state.payment_methods.push({
          ...pm,
          id: mapId(pm.id),
          organization_id: organizationId,
          customer_id: mapId(pm.customer_id),
        });
      });

    seed.notifications
      .filter((n) => n.organization_id === defaultOrgId)
      .forEach((n) => {
        this.state.notifications.push({
          ...n,
          id: mapId(n.id),
          organization_id: organizationId,
          entity_id: n.entity_id ? mapId(n.entity_id) : undefined,
        });
      });

    this.logAudit({
      organization_id: organizationId,
      actor_id: userId,
      actor_email: 'system@revive.io',
      action: 'demo.reset',
      entity_type: 'organization',
      entity_id: organizationId,
      metadata: { message: 'Demo workspace data reset to baseline seed' },
    });

    this.commit();
  }

  public logAudit(params: {
    organization_id: string;
    actor_id: string | null;
    actor_email: string;
    action: string;
    entity_type: string;
    entity_id: string;
    metadata?: Record<string, unknown>;
    ip_address?: string;
  }): AuditLog {
    const entry: AuditLog = {
      id: crypto.randomUUID(),
      organization_id: params.organization_id,
      actor_id: params.actor_id,
      actor_email: params.actor_email,
      action: params.action,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      metadata: params.metadata || {},
      ip_address: params.ip_address || '127.0.0.1',
      created_at: new Date().toISOString(),
    };
    this.state.audit_logs.unshift(entry);
    return entry;
  }

  public createNotificationIfNotExists(params: {
    organization_id: string;
    type: NotificationItem['type'];
    severity: NotificationItem['severity'];
    title: string;
    message: string;
    entity_type?: string;
    entity_id?: string;
    dedup_key: string;
  }): NotificationItem | null {
    const existing = this.state.notifications.find(
      (n) => n.organization_id === params.organization_id && n.dedup_key === params.dedup_key
    );
    if (existing) return null;

    // Respect user notification preferences if available
    const orgMember = this.state.organization_members.find(
      (m) => m.organization_id === params.organization_id && m.role === 'owner'
    );
    if (orgMember) {
      const profile = this.state.profiles.find((p) => p.id === orgMember.user_id);
      if (profile) {
        const prefs = profile.notification_preferences;
        if (params.type === 'failed_payment' && !prefs.failed_payments) return null;
        if (params.type === 'upcoming_renewal' && !prefs.upcoming_renewals) return null;
        if (params.type === 'overdue_invoice' && !prefs.overdue_invoices) return null;
        if (params.type === 'new_subscription' && !prefs.new_subscriptions) return null;
        if (params.type === 'cancellation' && !prefs.cancellations) return null;
        if (params.type === 'payment_confirmation' && !prefs.payment_confirmations) return null;
      }
    }

    const notif: NotificationItem = {
      id: crypto.randomUUID(),
      organization_id: params.organization_id,
      type: params.type,
      severity: params.severity,
      title: params.title,
      message: params.message,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      dedup_key: params.dedup_key,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    this.state.notifications.unshift(notif);
    return notif;
  }

  /**
   * Recompute customer risk scores & statuses and run automated checks for overdue invoices,
   * failed payments, and upcoming renewals without creating duplicate notifications.
   */
  public syncOrganizationHealthAndNotifications(organizationId: string): {
    newNotifications: number;
    updatedCustomers: number;
    updatedInvoices: number;
  } {
    const now = Date.now();
    let newNotifications = 0;
    let updatedCustomers = 0;
    let updatedInvoices = 0;

    const orgCustomers = this.state.customers.filter((c) => c.organization_id === organizationId);
    const orgSubs = this.state.subscriptions.filter((s) => s.organization_id === organizationId);
    const orgInvoices = this.state.invoices.filter((i) => i.organization_id === organizationId);
    const orgPayments = this.state.payments.filter((p) => p.organization_id === organizationId);

    // 1. Check pending invoices that have crossed due_date -> mark overdue
    for (const inv of orgInvoices) {
      if (inv.status === 'pending' && new Date(inv.due_date).getTime() < now) {
        inv.status = 'overdue';
        inv.updated_at = new Date().toISOString();
        updatedInvoices++;
      }
      if (inv.status === 'overdue') {
        const customer = orgCustomers.find((c) => c.id === inv.customer_id);
        const created = this.createNotificationIfNotExists({
          organization_id: organizationId,
          type: 'overdue_invoice',
          severity: 'warning',
          title: `${customer?.name || 'Customer'} invoice ${inv.invoice_number} is overdue`,
          message: `Invoice ${inv.invoice_number} for ₹${inv.total_amount.toLocaleString('en-IN')} is past its due date.`,
          entity_type: 'invoice',
          entity_id: inv.id,
          dedup_key: `overdue_invoice:${inv.id}`,
        });
        if (created) newNotifications++;
      }
      if (inv.status === 'payment_failed') {
        const customer = orgCustomers.find((c) => c.id === inv.customer_id);
        const created = this.createNotificationIfNotExists({
          organization_id: organizationId,
          type: 'failed_payment',
          severity: 'critical',
          title: `Payment failed for ${customer?.name || 'Customer'}`,
          message: `Invoice ${inv.invoice_number} (₹${inv.total_amount.toLocaleString('en-IN')}) requires payment recovery.`,
          entity_type: 'invoice',
          entity_id: inv.id,
          dedup_key: `failed_payment:${inv.id}`,
        });
        if (created) newNotifications++;
      }
    }

    // 2. Check upcoming subscription renewals within 7 days & expired trials
    for (const sub of orgSubs) {
      if (sub.status === 'trialing' && sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() < now) {
        sub.status = 'active';
        sub.updated_at = new Date().toISOString();
      }
      if ((sub.status === 'active' || sub.status === 'trialing') && sub.next_billing_date) {
        const daysUntil = (new Date(sub.next_billing_date).getTime() - now) / (1000 * 60 * 60 * 24);
        if (daysUntil >= 0 && daysUntil <= 7) {
          const customer = orgCustomers.find((c) => c.id === sub.customer_id);
          const dateKey = sub.next_billing_date.slice(0, 10);
          const created = this.createNotificationIfNotExists({
            organization_id: organizationId,
            type: 'upcoming_renewal',
            severity: 'info',
            title: `${customer?.name || 'Customer'} renews in ${Math.max(1, Math.ceil(daysUntil))} days`,
            message: `Subscription ${sub.code} (₹${sub.mrr_amount.toLocaleString('en-IN')}/mo) is scheduled for renewal on ${dateKey}.`,
            entity_type: 'subscription',
            entity_id: sub.id,
            dedup_key: `upcoming_renewal:${sub.id}:${dateKey}`,
          });
          if (created) newNotifications++;
        }
      }
    }

    // 3. Re-evaluate customer health & risk scores dynamically
    for (const customer of orgCustomers) {
      if (customer.status === 'archived') continue;
      const health = evaluateCustomerHealth(customer, orgSubs, orgInvoices, orgPayments);
      if (
        customer.risk_score !== health.riskScore ||
        customer.risk_reason !== health.riskReason ||
        customer.status !== health.suggestedStatus
      ) {
        customer.risk_score = health.riskScore;
        customer.risk_reason = health.riskReason;
        customer.status = health.suggestedStatus;
        customer.updated_at = new Date().toISOString();
        updatedCustomers++;
      }
    }

    if (newNotifications > 0 || updatedCustomers > 0 || updatedInvoices > 0) {
      this.commit();
    }

    return { newNotifications, updatedCustomers, updatedInvoices };
  }
}

export const db = new DataStore();
