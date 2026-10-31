import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../server/app.js';
import {
  calculateInvoiceTotals,
  calculateOrganizationMetrics,
  calculateSubscriptionMrr,
  runDeterministicSimulation,
} from '../server/finance.js';

const app = createApp();

describe('Revive Financial Engine & Edge Cases (Unit Tests)', () => {
  it('normalizes MRR accurately across monthly, quarterly, yearly, and weekly intervals with discounts', () => {
    expect(calculateSubscriptionMrr(8400, 1, 'monthly', 0)).toBe(8400);
    expect(calculateSubscriptionMrr(8400, 2, 'monthly', 10)).toBe(15120);
    expect(calculateSubscriptionMrr(288000, 1, 'yearly', 0)).toBe(24000);
    expect(calculateSubscriptionMrr(42600, 1, 'quarterly', 0)).toBe(14200);
    expect(calculateSubscriptionMrr(1200, 1, 'weekly', 0)).toBe(5200);
  });

  it('calculates server-side invoice totals with discounts and GST accurately', () => {
    const res = calculateInvoiceTotals(
      [
        { description: 'Growth Plan', quantity: 2, unit_price: 10000 },
        { description: 'Onboarding Add-on', quantity: 1, unit_price: 5000 },
      ],
      5000,
      18
    );
    expect(res.subtotal).toBe(25000);
    expect(res.discount_amount).toBe(5000);
    expect(res.tax_amount).toBe(3600);
    expect(res.total_amount).toBe(23600);
  });

  it('handles zero-revenue empty organizations without NaN or division by zero', () => {
    const emptyMetrics = calculateOrganizationMetrics({
      customers: [],
      plans: [],
      subscriptions: [],
      invoices: [],
      payments: [],
    });
    expect(emptyMetrics.mrr).toBe(0);
    expect(emptyMetrics.arr).toBe(0);
    expect(emptyMetrics.collected_revenue).toBe(0);
    expect(emptyMetrics.outstanding_revenue).toBe(0);
    expect(emptyMetrics.churn_rate).toBe(0);
    expect(emptyMetrics.collection_rate).toBe(100);
    expect(emptyMetrics.arpu).toBe(0);
  });

  it('computes deterministic 12-month business simulations', () => {
    const sim = runDeterministicSimulation({
      baseline_mrr: 100000,
      baseline_subscribers: 10,
      arpu: 10000,
      price_change_percent: 10,
      monthly_churn_percent: 2,
      baseline_churn_percent: 4,
      new_customers_per_month: 5,
      conversion_rate_percent: 25,
      payment_failure_percent: 4,
      recovery_rate_percent: 75,
      discount_percent: 0,
      months: 12,
    });
    expect(sim.timeline).toHaveLength(12);
    expect(sim.month_12_projected_mrr).toBeGreaterThan(100000);
    expect(sim.month_12_projected_arr).toBe(sim.month_12_projected_mrr * 12);
  });
});

describe('Revive Full-Stack API, Security, Multi-Tenant Isolation & Workflows', () => {
  let demoToken = '';
  let demoOrgId = '';
  let newTenantToken = '';
  let newTenantOrgId = '';

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/demo-login');
    expect(res.status).toBe(200);
    demoToken = res.body.token;
    demoOrgId = res.body.activeOrganization.id;

    // Reset demo org to clean baseline before tests
    await request(app)
      .post('/api/demo/reset')
      .set('Authorization', `Bearer ${demoToken}`)
      .set('x-organization-id', demoOrgId);
  });

  it('rejects unauthenticated requests to protected endpoints', async () => {
    const res = await request(app).get('/api/customers');
    expect(res.status).toBe(401);
  });

  it('registers a new user and creates an isolated organization', async () => {
    const uniqueEmail = `founder_${Date.now()}@testcorp.io`;
    const res = await request(app).post('/api/auth/signup').send({
      email: uniqueEmail,
      password: 'SecurePassword123!',
      full_name: 'Rohan Verma',
      business_name: 'Verma Cloud Labs',
      business_type: 'B2B SaaS',
      currency: 'INR',
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.activeOrganization.name).toBe('Verma Cloud Labs');
    newTenantToken = res.body.token;
    newTenantOrgId = res.body.activeOrganization.id;
  });

  it('enforces strict organization-level data isolation (blocks cross-tenant access)', async () => {
    // New tenant attempting to read Brightloop Software's organization data via header spoofing
    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', demoOrgId);

    expect(res.status).toBe(403);

    // New tenant attempting to access a Brightloop customer ID directly
    const detailRes = await request(app)
      .get('/api/customers/cus-northstar-1042')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', newTenantOrgId);

    expect(detailRes.status).toBe(404);
  });

  it('returns empty analytics cleanly for a newly created organization', async () => {
    const res = await request(app)
      .get('/api/analytics/overview')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', newTenantOrgId);

    expect(res.status).toBe(200);
    expect(res.body.metrics.mrr).toBe(0);
    expect(res.body.metrics.total_customers_count).toBe(0);
  });

  it('performs full Customer, Plan, Subscription lifecycle, and Invoice operations', async () => {
    // 1. Create a plan in the new tenant
    const planRes = await request(app)
      .post('/api/plans')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', newTenantOrgId)
      .send({
        name: 'Enterprise Monthly',
        description: 'Mission critical tier',
        price: 15000,
        billing_interval: 'monthly',
        trial_days: 0,
        features: ['Dedicated support', 'Custom SLA'],
      });
    expect(planRes.status).toBe(201);
    const planId = planRes.body.plan.id;

    // 2. Create a customer
    const custRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', newTenantOrgId)
      .send({
        name: 'Zenith Fintech',
        email: 'billing@zenithfin.in',
        company: 'Zenith Fintech Pvt Ltd',
        tax_id: '29AAACZ1234F1Z1',
      });
    expect(custRes.status).toBe(201);
    const customerId = custRes.body.customer.id;

    // 3. Create a subscription with 2 seats and 10% discount -> MRR = 15000 * 2 * 0.9 = 27000
    const subRes = await request(app)
      .post('/api/subscriptions')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', newTenantOrgId)
      .send({
        customer_id: customerId,
        plan_id: planId,
        quantity: 2,
        discount_percent: 10,
        start_trial: false,
        generate_invoice: true,
      });
    expect(subRes.status).toBe(201);
    expect(subRes.body.subscription.mrr_amount).toBe(27000);
    expect(subRes.body.invoice).toBeTruthy();
    const subId = subRes.body.subscription.id;
    const invoiceId = subRes.body.invoice.id;

    // 4. Prevent deleting an actively used plan without migration
    const delPlanBlocked = await request(app)
      .delete(`/api/plans/${planId}`)
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', newTenantOrgId);
    expect(delPlanBlocked.status).toBe(409);

    // 5. Pause subscription -> MRR drops to 0
    const pauseRes = await request(app)
      .post(`/api/subscriptions/${subId}/lifecycle`)
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', newTenantOrgId)
      .send({ action: 'pause' });
    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body.subscription.status).toBe('paused');
    expect(pauseRes.body.subscription.mrr_amount).toBe(0);

    // 6. Resume subscription -> MRR restored to 27000
    const resumeRes = await request(app)
      .post(`/api/subscriptions/${subId}/lifecycle`)
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', newTenantOrgId)
      .send({ action: 'resume' });
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.subscription.status).toBe('active');
    expect(resumeRes.body.subscription.mrr_amount).toBe(27000);

    // 7. Verify Razorpay payment signature server-side (rejects invalid, accepts valid HMAC)
    const orderRes = await request(app)
      .post('/api/payments/razorpay/create-order')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', newTenantOrgId)
      .send({ invoice_id: invoiceId });
    expect(orderRes.status).toBe(200);
    const orderId = orderRes.body.order_id;
    const paymentId = `pay_test_${Date.now()}`;

    const badVerify = await request(app)
      .post('/api/payments/razorpay/verify')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', newTenantOrgId)
      .send({
        invoice_id: invoiceId,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: 'invalid_tampered_signature',
      });
    expect(badVerify.status).toBe(400);

    const secret = process.env.RAZORPAY_KEY_SECRET || 'revive_test_mode_hmac_secret';
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const goodVerify = await request(app)
      .post('/api/payments/razorpay/verify')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', newTenantOrgId)
      .send({
        invoice_id: invoiceId,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature,
      });
    expect(goodVerify.status).toBe(200);
    expect(goodVerify.body.verified).toBe(true);
    expect(goodVerify.body.invoice.status).toBe('paid');

    // Duplicate verification is blocked
    const dupVerify = await request(app)
      .post('/api/payments/razorpay/verify')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', newTenantOrgId)
      .send({
        invoice_id: invoiceId,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature,
      });
    expect(dupVerify.status).toBe(409);
  });

  it('verifies Razorpay webhooks with HMAC-SHA256 and enforces idempotency on duplicate events', async () => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'revive_test_webhook_secret';
    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_wh_999',
            order_id: 'order_wh_999',
            method: 'UPI',
            notes: { organization_id: demoOrgId },
          },
        },
      },
    };
    const rawBody = JSON.stringify(payload);
    const sig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    const eventId = `evt_idempotent_${Date.now()}`;

    const firstCall = await request(app)
      .post('/api/webhooks/razorpay')
      .set('x-razorpay-signature', sig)
      .set('x-razorpay-event-id', eventId)
      .set('Content-Type', 'application/json')
      .send(rawBody);
    expect(firstCall.status).toBe(200);
    expect(firstCall.body.status).toBe('processed');

    const duplicateCall = await request(app)
      .post('/api/webhooks/razorpay')
      .set('x-razorpay-signature', sig)
      .set('x-razorpay-event-id', eventId)
      .set('Content-Type', 'application/json')
      .send(rawBody);
    expect(duplicateCall.status).toBe(200);
    expect(duplicateCall.body.status).toBe('duplicate_ignored');
  });

  it('handles AI Revenue Copilot configuration disclosure and deterministic ledger analysis', async () => {
    const res = await request(app)
      .post('/api/ai/copilot')
      .set('Authorization', `Bearer ${demoToken}`)
      .set('x-organization-id', demoOrgId)
      .send({
        message: 'What is our current MRR and which customers are at risk?',
        allowDeterministicFallback: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.answer).toBeTruthy();
    expect(res.body.context.current_mrr).toBeGreaterThan(0);
  });
});

