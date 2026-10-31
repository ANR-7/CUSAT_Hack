-- ============================================================================
-- REVIVE SUBSCRIPTION INTELLIGENCE — DEVELOPMENT & DEMO SEED DATA
-- ============================================================================

-- Note: For local development or Supabase SQL Editor seeding, this file
-- populates the default demonstration organization ("Brightloop Software")
-- and a second isolated organization ("Apex Cloud Systems") to verify
-- multi-tenant data isolation.

DO $$
DECLARE
  v_org_id UUID := '11111111-1111-4111-8111-111111111111';
  v_plan_starter UUID := '22222222-1111-4111-8111-111111111101';
  v_plan_pro UUID := '22222222-1111-4111-8111-111111111102';
  v_plan_growth UUID := '22222222-1111-4111-8111-111111111103';
  v_plan_scale UUID := '22222222-1111-4111-8111-111111111104';
  v_cus_northstar UUID := '33333333-1111-4111-8111-111111111101';
  v_cus_morrow UUID := '33333333-1111-4111-8111-111111111102';
  v_cus_pixelforge UUID := '33333333-1111-4111-8111-111111111103';
  v_cus_cedar UUID := '33333333-1111-4111-8111-111111111104';
BEGIN
  INSERT INTO public.organizations (
    id, name, slug, business_type, currency, tax_rate, tax_id, billing_email, address, country, invoice_prefix, onboarding_completed
  ) VALUES (
    v_org_id, 'Brightloop Software', 'brightloop-software', 'B2B SaaS', 'INR', 18.00, '29AABCB1234F1Z5', 'billing@brightloop.io', 'Indiranagar, Bengaluru, KA 560038', 'IN', 'INV', TRUE
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.plans (id, organization_id, code, name, description, price, currency, billing_interval, trial_days, features, status)
  VALUES
    (v_plan_starter, v_org_id, 'PLN-01', 'Starter Monthly', 'Essential subscription analytics and automated invoicing for early-stage teams.', 3900.00, 'INR', 'monthly', 14, '["Core subscription tracking", "Automated GST invoices", "Email support", "Up to 250 subscribers"]'::jsonb, 'active'),
    (v_plan_pro, v_org_id, 'PLN-02', 'Pro Monthly', 'Full revenue intelligence, dunning workflows, and cohort analytics.', 8400.00, 'INR', 'monthly', 14, '["Advanced revenue analytics", "Smart payment recovery", "Priority support", "Custom webhook events"]'::jsonb, 'active'),
    (v_plan_growth, v_org_id, 'PLN-03', 'Growth Monthly', 'Multi-seat workspace with AI Revenue Copilot and scenario forecasting.', 12500.00, 'INR', 'monthly', 14, '["AI Revenue Copilot", "Business scenario simulator", "Team RBAC permissions", "Dedicated slack channel"]'::jsonb, 'active'),
    (v_plan_scale, v_org_id, 'PLN-04', 'Scale Annual', 'Enterprise-grade billing orchestration with annual commitment.', 288000.00, 'INR', 'yearly', 30, '["Unlimited seats & entities", "Custom SLA & dedicated CSM", "Audit logs & SOC2 compliance", "Multi-currency reconciliation"]'::jsonb, 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.customers (id, organization_id, external_code, name, email, phone, company, tax_id, billing_address, status, risk_score, risk_reason, preferred_payment_method)
  VALUES
    (v_cus_northstar, v_org_id, 'CUS-1042', 'Northstar Studio', 'finance@northstar.io', '+91 98450 11201', 'Northstar Digital Pvt Ltd', '27AAACN1042D1Z1', 'Bandra West, Mumbai, MH', 'at_risk', 86, '2 failed payment attempts', 'Card'),
    (v_cus_morrow, v_org_id, 'CUS-1041', 'Morrow & Co.', 'ops@morrow.co', '+91 98450 11202', 'Morrow Consulting LLP', '29AABCM1041E1Z5', 'MG Road, Bengaluru, KA', 'active', 12, 'Healthy account', 'UPI'),
    (v_cus_pixelforge, v_org_id, 'CUS-1039', 'PixelForge', 'billing@pixelforge.dev', '+91 98450 11203', 'PixelForge Interactive', '36AAACP1039H1Z9', 'HITEC City, Hyderabad, TS', 'past_due', 74, 'Invoice overdue by 25 days', 'Card'),
    (v_cus_cedar, v_org_id, 'CUS-1038', 'Cedar Labs', 'accounts@cedarlabs.in', '+91 98450 11204', 'Cedar Labs Technologies', '07AAACC1038B1Z2', 'Connaught Place, New Delhi, DL', 'active', 8, 'Healthy account', 'Bank transfer')
  ON CONFLICT (id) DO NOTHING;
END $$;
