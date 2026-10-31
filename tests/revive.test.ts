import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, isGeminiConfigured } from '../server/app.js';
import { db, isSupabaseConfigured } from '../server/store.js';
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

describe('Revive Full-Stack API, Supabase Persistence, Gemini AI, Demo Payments & Isolation', () => {
  let demoToken = '';
  let demoOrgId = '';
  let newTenantToken = '';
  let newTenantOrgId = '';

  beforeAll(async () => {
    await db.initSupabasePersistence();

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

  it('connects to live Supabase project and verifies integration health status', async () => {
    expect(isSupabaseConfigured()).toBe(true);
    expect(isGeminiConfigured()).toBe(true);

    const healthRes = await request(app).get('/api/health');
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.integrations.supabase).toBe(true);
    expect(healthRes.body.integrations.supabaseConnected).toBe(true);
    expect(healthRes.body.integrations.gemini).toBe(true);
    expect(healthRes.body.integrations.paymentsMode).toBe('demo_only');
    expect(healthRes.body.integrations.openai).toBeUndefined();
    expect(healthRes.body.integrations.razorpay).toBeUndefined();

    // Verify cloud state push to Supabase
    const pushed = await db.pushStateToSupabaseStorage();
    expect(pushed).toBe(true);
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

  it('performs full Customer, Plan, Subscription lifecycle, Invoice CRUD, and DEMO MODE payments (success, failure, refund)', async () => {
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

    // 7. Simulate a FAILED payment in DEMO MODE -> marks invoice payment_failed and subscription past_due
    const failSim = await request(app)
      .post('/api/payments/simulate')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', newTenantOrgId)
      .send({
        invoice_id: invoiceId,
        outcome: 'failed',
        payment_method: 'Card',
        failure_reason: 'Simulated bank decline (Demo Mode)',
      });
    expect(failSim.status).toBe(200);
    expect(failSim.body.simulated).toBe(true);
    expect(failSim.body.demoMode).toBe(true);
    expect(failSim.body.payment.status).toBe('failed');
    expect(failSim.body.payment.provider).toBe('simulated_demo');
    expect(failSim.body.invoice.status).toBe('payment_failed');

    // 8. Simulate a SUCCESSFUL payment in DEMO MODE -> settles invoice and restores subscription to active
    const successSim = await request(app)
      .post('/api/payments/simulate')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', newTenantOrgId)
      .send({
        invoice_id: invoiceId,
        outcome: 'success',
        payment_method: 'UPI',
      });
    expect(successSim.status).toBe(200);
    expect(successSim.body.simulated).toBe(true);
    expect(successSim.body.demoMode).toBe(true);
    expect(successSim.body.payment.status).toBe('captured');
    expect(successSim.body.payment.provider).toBe('simulated_demo');
    expect(successSim.body.invoice.status).toBe('paid');

    // Duplicate payment simulation on already-paid invoice is blocked
    const dupSim = await request(app)
      .post('/api/payments/simulate')
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', newTenantOrgId)
      .send({
        invoice_id: invoiceId,
        outcome: 'success',
        payment_method: 'UPI',
      });
    expect(dupSim.status).toBe(409);

    // 9. Partial refund in DEMO MODE
    const paymentId = successSim.body.payment.id;
    const refundRes = await request(app)
      .post(`/api/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${newTenantToken}`)
      .set('x-organization-id', newTenantOrgId)
      .send({ amount: 1860 });
    expect(refundRes.status).toBe(200);
    expect(refundRes.body.payment.status).toBe('partially_refunded');
    expect(refundRes.body.payment.refunded_amount).toBe(1860);
  });

  it('generates live Google Gemini AI Revenue Copilot insights grounded in actual Revive business data', async () => {
    const res = await request(app)
      .post('/api/ai/copilot')
      .set('Authorization', `Bearer ${demoToken}`)
      .set('x-organization-id', demoOrgId)
      .send({
        message: 'What is our current MRR and which customers are at risk of churning?',
        allowDeterministicFallback: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(['gemini_live', 'deterministic_analytics_engine']).toContain(res.body.mode);
    expect(res.body.answer).toBeTruthy();
    expect(res.body.context.current_mrr).toBeGreaterThan(0);
  }, 25000);
});


