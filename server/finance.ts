import {
  BillingInterval,
  Customer,
  Invoice,
  InvoiceLineItem,
  Payment,
  Plan,
  Subscription,
} from './types.js';

/**
 * Round monetary values to 2 decimal places safely
 */
export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Normalize a subscription's recurring price to Monthly Recurring Revenue (MRR).
 * Only active, trialing, or past_due subscriptions contribute to current MRR
 * (paused, cancelled, and expired do not contribute to active MRR).
 */
export function calculateSubscriptionMrr(
  unitPrice: number,
  quantity: number,
  billingInterval: BillingInterval,
  discountPercent: number = 0
): number {
  const safePrice = Math.max(0, Number(unitPrice) || 0);
  const safeQty = Math.max(1, Math.floor(Number(quantity) || 1));
  const safeDiscount = Math.min(100, Math.max(0, Number(discountPercent) || 0));

  const netPeriodValue = safePrice * safeQty * (1 - safeDiscount / 100);

  switch (billingInterval) {
    case 'monthly':
      return roundMoney(netPeriodValue);
    case 'quarterly':
      return roundMoney(netPeriodValue / 3);
    case 'yearly':
      return roundMoney(netPeriodValue / 12);
    case 'weekly':
      return roundMoney((netPeriodValue * 52) / 12);
    default:
      return roundMoney(netPeriodValue);
  }
}

/**
 * Calculate next billing date from a start or current date based on billing interval.
 */
export function addBillingInterval(dateIso: string, interval: BillingInterval): string {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString();
  }
  switch (interval) {
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case 'monthly':
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case 'quarterly':
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case 'yearly':
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
  }
  return d.toISOString();
}

/**
 * Server-side calculation of invoice totals from line items, discount, and tax rate.
 */
export function calculateInvoiceTotals(
  lineItems: Array<{ id?: string; description: string; quantity: number; unit_price: number }>,
  discountAmount: number = 0,
  taxRate: number = 18
): {
  normalizedItems: InvoiceLineItem[];
  subtotal: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
} {
  const normalizedItems: InvoiceLineItem[] = lineItems.map((item, idx) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const unitPrice = Math.max(0, Number(item.unit_price) || 0);
    const amount = roundMoney(qty * unitPrice);
    return {
      id: item.id || `item-${idx + 1}`,
      description: String(item.description || 'Subscription service').trim(),
      quantity: qty,
      unit_price: roundMoney(unitPrice),
      amount,
    };
  });

  const subtotal = roundMoney(normalizedItems.reduce((sum, i) => sum + i.amount, 0));
  const clampedDiscount = roundMoney(Math.min(subtotal, Math.max(0, Number(discountAmount) || 0)));
  const taxableBase = Math.max(0, subtotal - clampedDiscount);
  const safeTaxRate = Math.min(100, Math.max(0, Number(taxRate) || 0));
  const tax_amount = roundMoney((taxableBase * safeTaxRate) / 100);
  const total_amount = roundMoney(taxableBase + tax_amount);

  return {
    normalizedItems,
    subtotal,
    discount_amount: clampedDiscount,
    tax_rate: safeTaxRate,
    tax_amount,
    total_amount,
  };
}

/**
 * Dynamic evaluation of customer risk score and status based on their invoices, payments, and subscriptions.
 */
export function evaluateCustomerHealth(
  customer: Customer,
  subscriptions: Subscription[],
  invoices: Invoice[],
  payments: Payment[]
): { riskScore: number; riskReason: string; suggestedStatus: Customer['status'] } {
  if (customer.status === 'archived') {
    return { riskScore: customer.risk_score, riskReason: customer.risk_reason, suggestedStatus: 'archived' };
  }

  const custSubs = subscriptions.filter((s) => s.customer_id === customer.id);
  const custInvoices = invoices.filter((i) => i.customer_id === customer.id);
  const custPayments = payments.filter((p) => p.customer_id === customer.id);

  const failedPayments = custPayments.filter((p) => p.status === 'failed');
  const failedInvoices = custInvoices.filter((i) => i.status === 'payment_failed');
  const overdueInvoices = custInvoices.filter((i) => i.status === 'overdue');
  const activeSubs = custSubs.filter((s) => s.status === 'active' || s.status === 'trialing');
  const cancelledSubs = custSubs.filter((s) => s.status === 'cancelled');

  let score = 10;
  const reasons: string[] = [];

  if (failedInvoices.length > 0 || failedPayments.length > 0) {
    const count = Math.max(failedInvoices.length, failedPayments.length);
    score += Math.min(55, count * 28);
    reasons.push(`${count} failed payment attempt${count > 1 ? 's' : ''}`);
  }

  if (overdueInvoices.length > 0) {
    score += Math.min(45, overdueInvoices.length * 30);
    reasons.push(`${overdueInvoices.length} overdue invoice${overdueInvoices.length > 1 ? 's' : ''}`);
  }

  const now = Date.now();
  const soonRenewals = activeSubs.filter((s) => {
    if (!s.next_billing_date) return false;
    const diffDays = (new Date(s.next_billing_date).getTime() - now) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 5;
  });
  if (soonRenewals.length > 0) {
    score += 18;
    reasons.push('Upcoming renewal within 5 days');
  }

  if (activeSubs.length === 0 && cancelledSubs.length > 0) {
    return {
      riskScore: 95,
      riskReason: 'All subscriptions cancelled',
      suggestedStatus: 'churned',
    };
  }

  const clampedScore = Math.min(98, Math.max(5, score));
  let suggestedStatus: Customer['status'] = 'active';
  if (overdueInvoices.length > 0) {
    suggestedStatus = 'past_due';
  } else if (clampedScore >= 50 || failedInvoices.length > 0) {
    suggestedStatus = 'at_risk';
  }

  return {
    riskScore: clampedScore,
    riskReason: reasons.length > 0 ? reasons.join('; ') : 'Healthy account',
    suggestedStatus,
  };
}

/**
 * Comprehensive organization financial metrics calculation from real database records.
 * Avoids double-counting revenue and separates MRR, ARR, Invoiced, Collected, and Outstanding.
 */
export function calculateOrganizationMetrics(params: {
  customers: Customer[];
  plans: Plan[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  payments: Payment[];
  dateFrom?: string;
  dateTo?: string;
}) {
  const { customers, plans, subscriptions, invoices, payments, dateFrom, dateTo } = params;

  const fromTime = dateFrom ? new Date(dateFrom).getTime() : 0;
  const toTime = dateTo ? new Date(dateTo).getTime() : Number.MAX_SAFE_INTEGER;

  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= fromTime && t <= toTime;
  };

  // Active recurring subscriptions (active + trialing + past_due still under contract)
  const revenueGeneratingSubs = subscriptions.filter(
    (s) => s.status === 'active' || s.status === 'trialing'
  );
  const pastDueSubs = subscriptions.filter((s) => s.status === 'past_due');
  const pausedSubs = subscriptions.filter((s) => s.status === 'paused');
  const cancelledSubs = subscriptions.filter((s) => s.status === 'cancelled');

  // MRR from active & trialing subscriptions
  const activeMrr = roundMoney(
    revenueGeneratingSubs.reduce((sum, s) => sum + Number(s.mrr_amount || 0), 0)
  );
  // Past due MRR (at risk)
  const pastDueMrr = roundMoney(
    pastDueSubs.reduce((sum, s) => sum + Number(s.mrr_amount || 0), 0)
  );
  const totalMrr = roundMoney(activeMrr + pastDueMrr);
  const arr = roundMoney(totalMrr * 12);

  // Revenue at risk: MRR of customers who are at_risk or past_due, or subscriptions that are past_due
  const riskyCustomerIds = new Set(
    customers
      .filter((c) => c.status === 'at_risk' || c.status === 'past_due' || c.risk_score >= 60)
      .map((c) => c.id)
  );
  const mrrAtRisk = roundMoney(
    subscriptions
      .filter(
        (s) =>
          (s.status === 'active' || s.status === 'past_due' || s.status === 'trialing') &&
          (riskyCustomerIds.has(s.customer_id) || s.status === 'past_due')
      )
      .reduce((sum, s) => sum + Number(s.mrr_amount || 0), 0)
  );

  // Invoices & Payments metrics (no double counting)
  const validInvoices = invoices.filter((i) => i.status !== 'void' && i.status !== 'draft');
  const totalInvoiced = roundMoney(
    validInvoices.reduce((sum, i) => sum + Number(i.total_amount || 0), 0)
  );

  // Collected revenue comes from captured payments (minus any refunds)
  const capturedPayments = payments.filter(
    (p) => p.status === 'captured' || p.status === 'partially_refunded'
  );
  const collectedRevenue = roundMoney(
    capturedPayments.reduce(
      (sum, p) => sum + Math.max(0, Number(p.amount || 0) - Number(p.refunded_amount || 0)),
      0
    )
  );

  // Outstanding revenue: unpaid valid invoices (pending, overdue, payment_failed)
  const unpaidInvoices = invoices.filter(
    (i) => i.status === 'pending' || i.status === 'overdue' || i.status === 'payment_failed'
  );
  const outstandingRevenue = roundMoney(
    unpaidInvoices.reduce((sum, i) => sum + Number(i.total_amount || 0), 0)
  );

  const overdueInvoices = invoices.filter((i) => i.status === 'overdue');
  const overdueRevenue = roundMoney(
    overdueInvoices.reduce((sum, i) => sum + Number(i.total_amount || 0), 0)
  );

  const failedInvoices = invoices.filter((i) => i.status === 'payment_failed');
  const failedPaymentsList = payments.filter((p) => p.status === 'failed');
  const failedPaymentAmount = roundMoney(
    failedInvoices.reduce((sum, i) => sum + Number(i.total_amount || 0), 0)
  );

  // Churn rate calculation
  const totalEverSubscribed =
    revenueGeneratingSubs.length + pastDueSubs.length + pausedSubs.length + cancelledSubs.length;
  const churnRate =
    totalEverSubscribed > 0
      ? roundMoney((cancelledSubs.length / totalEverSubscribed) * 100)
      : 0;

  // Filtered counts within range
  const newSubscriptionsInPeriod = subscriptions.filter((s) => inRange(s.start_date)).length;
  const collectedInPeriod = roundMoney(
    capturedPayments
      .filter((p) => inRange(p.paid_at || p.created_at))
      .reduce((sum, p) => sum + Math.max(0, Number(p.amount || 0) - Number(p.refunded_amount || 0)), 0)
  );

  // Plan distribution & performance
  const planPerformance = plans.map((plan) => {
    const planSubs = subscriptions.filter(
      (s) =>
        s.plan_id === plan.id &&
        (s.status === 'active' || s.status === 'trialing' || s.status === 'past_due')
    );
    const planMrr = roundMoney(planSubs.reduce((sum, s) => sum + Number(s.mrr_amount || 0), 0));
    return {
      plan_id: plan.id,
      name: plan.name,
      code: plan.code,
      billing_interval: plan.billing_interval,
      price: plan.price,
      active_subscriptions: planSubs.length,
      mrr: planMrr,
      arr: roundMoney(planMrr * 12),
      share_percent: totalMrr > 0 ? roundMoney((planMrr / totalMrr) * 100) : 0,
    };
  });

  // Collection rate
  const collectionRate =
    totalInvoiced > 0 ? roundMoney(Math.min(100, (collectedRevenue / totalInvoiced) * 100)) : 100;

  // Average revenue per active customer (ARPU)
  const activeCustomersCount = customers.filter(
    (c) => c.status !== 'archived' && c.status !== 'churned'
  ).length;
  const arpu = activeCustomersCount > 0 ? roundMoney(totalMrr / activeCustomersCount) : 0;

  return {
    mrr: totalMrr,
    active_mrr: activeMrr,
    past_due_mrr: pastDueMrr,
    arr,
    mrr_at_risk: mrrAtRisk,
    total_invoiced: totalInvoiced,
    collected_revenue: collectedRevenue,
    collected_in_period: collectedInPeriod,
    outstanding_revenue: outstandingRevenue,
    overdue_revenue: overdueRevenue,
    failed_payment_amount: failedPaymentAmount,
    failed_payments_count: Math.max(failedInvoices.length, failedPaymentsList.length),
    unpaid_invoices_count: unpaidInvoices.length,
    overdue_invoices_count: overdueInvoices.length,
    active_subscriptions_count: revenueGeneratingSubs.length + pastDueSubs.length,
    trialing_subscriptions_count: subscriptions.filter((s) => s.status === 'trialing').length,
    paused_subscriptions_count: pausedSubs.length,
    cancelled_subscriptions_count: cancelledSubs.length,
    new_subscriptions_count: newSubscriptionsInPeriod,
    total_customers_count: customers.filter((c) => c.status !== 'archived').length,
    healthy_customers_count: customers.filter((c) => c.status === 'active').length,
    at_risk_customers_count: customers.filter(
      (c) => c.status === 'at_risk' || c.status === 'past_due'
    ).length,
    churn_rate: churnRate,
    collection_rate: collectionRate,
    arpu,
    plan_performance: planPerformance,
  };
}

export interface SimulationInput {
  baseline_mrr: number;
  baseline_subscribers: number;
  arpu: number;
  price_change_percent: number;
  monthly_churn_percent: number;
  baseline_churn_percent: number;
  new_customers_per_month: number;
  conversion_rate_percent: number;
  payment_failure_percent: number;
  recovery_rate_percent: number;
  discount_percent: number;
  months?: number;
}

/**
 * Deterministic 12-month Business Simulator & Revenue Forecasting engine.
 */
export function runDeterministicSimulation(input: SimulationInput) {
  const monthsCount = Math.min(24, Math.max(3, input.months || 12));
  const baseMrr = Math.max(0, Number(input.baseline_mrr) || 0);
  const baseSubs = Math.max(0, Number(input.baseline_subscribers) || 0);
  const baseArpu =
    input.arpu > 0 ? Number(input.arpu) : baseSubs > 0 ? baseMrr / baseSubs : 8400;

  const priceMultiplier = 1 + (Number(input.price_change_percent) || 0) / 100;
  const discountFactor = 1 - ((Number(input.discount_percent) || 0) / 100) * 0.25;
  const effectiveArpu = roundMoney(baseArpu * priceMultiplier * discountFactor);

  const scenarioChurnRate = Math.min(100, Math.max(0, Number(input.monthly_churn_percent) || 0)) / 100;
  const baselineChurnRate = Math.min(100, Math.max(0, Number(input.baseline_churn_percent) || 3.5)) / 100;

  const failureRate = Math.min(100, Math.max(0, Number(input.payment_failure_percent) || 0)) / 100;
  const recoveryRate = Math.min(100, Math.max(0, Number(input.recovery_rate_percent) || 0)) / 100;
  const unrecoveredLossFactor = failureRate * (1 - recoveryRate);

  const monthlyLeadsOrTrials = Math.max(0, Number(input.new_customers_per_month) || 0);
  const conversionMultiplier =
    input.conversion_rate_percent > 0
      ? Math.min(100, Number(input.conversion_rate_percent)) / 25 // normalized around 25% trial-to-paid baseline
      : 1;
  const effectiveNewSubsPerMonth = Math.round(monthlyLeadsOrTrials * conversionMultiplier);

  const monthNames = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  const timeline: Array<{
    month_index: number;
    month: string;
    baseline_mrr: number;
    projected_mrr: number;
    baseline_subscribers: number;
    projected_subscribers: number;
    churned_mrr: number;
    new_mrr: number;
    recovered_mrr: number;
  }> = [];

  let currentScenarioSubs = baseSubs;
  let currentBaselineSubs = baseSubs;
  let currentScenarioMrr = roundMoney(baseMrr * priceMultiplier * discountFactor);
  let currentBaselineMrr = baseMrr;

  for (let i = 0; i < monthsCount; i++) {
    const label = monthNames[i % monthNames.length];

    // Churn loss
    const churnedMrr = roundMoney(currentScenarioMrr * scenarioChurnRate);
    const baselineChurnedMrr = roundMoney(currentBaselineMrr * baselineChurnRate);

    // New subscriber expansion
    const newMrr = roundMoney(effectiveNewSubsPerMonth * effectiveArpu);
    const baselineNewMrr = roundMoney(Math.round(monthlyLeadsOrTrials * 0.7) * baseArpu);

    // Gross before payment failure
    const grossScenarioMrr = Math.max(0, currentScenarioMrr - churnedMrr + newMrr);
    const failedMrr = roundMoney(grossScenarioMrr * failureRate);
    const recoveredMrr = roundMoney(failedMrr * recoveryRate);
    const netScenarioMrr = roundMoney(grossScenarioMrr - failedMrr + recoveredMrr);

    const netBaselineMrr = roundMoney(
      Math.max(0, currentBaselineMrr - baselineChurnedMrr + baselineNewMrr * (1 - 0.04 * 0.4))
    );

    currentScenarioSubs = Math.max(
      0,
      Math.round(currentScenarioSubs * (1 - scenarioChurnRate) + effectiveNewSubsPerMonth)
    );
    currentBaselineSubs = Math.max(
      0,
      Math.round(currentBaselineSubs * (1 - baselineChurnRate) + Math.round(monthlyLeadsOrTrials * 0.7))
    );

    currentScenarioMrr = netScenarioMrr;
    currentBaselineMrr = netBaselineMrr;

    timeline.push({
      month_index: i + 1,
      month: label,
      baseline_mrr: currentBaselineMrr,
      projected_mrr: currentScenarioMrr,
      baseline_subscribers: currentBaselineSubs,
      projected_subscribers: currentScenarioSubs,
      churned_mrr: churnedMrr,
      new_mrr: newMrr,
      recovered_mrr: recoveredMrr,
    });
  }

  const month1 = timeline[0];
  const month12 = timeline[timeline.length - 1];

  return {
    immediate_projected_mrr: month1.projected_mrr,
    month_12_projected_mrr: month12.projected_mrr,
    month_12_projected_arr: roundMoney(month12.projected_mrr * 12),
    mrr_delta_month_1: roundMoney(month1.projected_mrr - baseMrr),
    mrr_delta_month_12: roundMoney(month12.projected_mrr - month12.baseline_mrr),
    growth_percent_12m:
      baseMrr > 0 ? roundMoney(((month12.projected_mrr - baseMrr) / baseMrr) * 100) : 0,
    projected_subscribers_12m: month12.projected_subscribers,
    effective_arpu: effectiveArpu,
    monthly_recovered_revenue: month1.recovered_mrr,
    monthly_churn_loss: month1.churned_mrr,
    monthly_expansion_revenue: month1.new_mrr,
    unrecovered_loss_percent: roundMoney(unrecoveredLossFactor * 100),
    timeline,
  };
}
