import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { z } from 'zod';
import {
  db,
  hashPassword,
  isSupabaseConfigured,
  signToken,
  verifyPassword,
  verifyToken,
} from './store.js';
import {
  addBillingInterval,
  calculateInvoiceTotals,
  calculateOrganizationMetrics,
  calculateSubscriptionMrr,
  roundMoney,
  runDeterministicSimulation,
} from './finance.js';
import {
  BillingInterval,
  CurrencyCode,
  Customer,
  Invoice,
  Organization,
  Payment,
  Plan,
  Profile,
  Subscription,
} from './types.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

export interface AuthenticatedRequest extends Request {
  user?: Profile;
  organization?: Organization;
  orgRole?: string;
}

export function isGeminiConfigured(): boolean {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  return Boolean(key && key.length > 10 && !key.includes('your_gemini'));
}

function isEmailConfigured(): boolean {
  const key = process.env.RESEND_API_KEY || '';
  return Boolean(key && !key.includes('your_'));
}

async function generateWithGemini(params: {
  systemInstruction: string;
  history: Array<{ role?: string; text?: string }>;
  userMessage: string;
}): Promise<{ answer: string; requestedModel: string; resolvedModel: string }> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const requestedModel = (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
  const cleanModel = requestedModel.replace(/^models\//, '');

  const contents = [
    ...params.history.slice(-6).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.text || '') }],
    })),
    {
      role: 'user',
      parts: [{ text: params.userMessage }],
    },
  ];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cleanModel
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: params.systemInstruction }],
      },
      contents,
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 429) {
      throw new Error('Gemini API rate limit exceeded (HTTP 429). Please retry in a moment.');
    }
    throw new Error(`Gemini API HTTP ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    }>;
  };

  const parts = data.candidates?.[0]?.content?.parts || [];
  const text =
    parts
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text || '')
      .join('')
      .trim() ||
    parts
      .map((p) => p.text || '')
      .join('')
      .trim();

  if (!text) {
    throw new Error('Gemini API returned an empty response candidate.');
  }

  return {
    answer: text,
    requestedModel,
    resolvedModel: cleanModel,
  };
}

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CLIENT_URL ? [process.env.CLIENT_URL, 'http://localhost:5173'] : true,
      credentials: true,
    })
  );

  app.use(
    express.json({
      limit: '1mb',
    })
  );

  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again in a minute.' },
  });

  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI Copilot rate limit reached. Please wait a moment before asking again.' },
  });

  app.use('/api', apiLimiter);

  // --------------------------------------------------------------------------
  // HEALTH & INTEGRATION CONFIGURATION STATUS
  // --------------------------------------------------------------------------
  app.get('/api/health', (_req, res) => {
    const sbStatus = db.getSupabaseStatus();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      integrations: {
        supabase: isSupabaseConfigured(),
        supabaseConnected: sbStatus.connected,
        supabasePersistenceMode: sbStatus.persistenceMode,
        supabaseUrl: sbStatus.url,
        gemini: isGeminiConfigured(),
        geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
        paymentsMode: 'demo_only',
        email: isEmailConfigured(),
      },
    });
  });

  // --------------------------------------------------------------------------
  // AUTHENTICATION MIDDLEWARE & TENANT ISOLATION
  // --------------------------------------------------------------------------
  const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required. Please log in.' });
      return;
    }

    const token = authHeader.slice(7).trim();
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired session token. Please log in again.' });
      return;
    }

    const state = db.getState();
    const user = state.profiles.find((p) => p.id === payload.sub);
    if (!user) {
      res.status(401).json({ error: 'User profile not found.' });
      return;
    }

    req.user = user;
    next();
  };

  const requireOrgAccess = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    requireAuth(req, res, () => {
      const user = req.user!;
      const state = db.getState();

      const requestedOrgId =
        (req.headers['x-organization-id'] as string) ||
        (req.query.organizationId as string) ||
        user.default_organization_id;

      if (!requestedOrgId) {
        res.status(400).json({ error: 'No organization selected. Please complete onboarding.' });
        return;
      }

      // Verify organization membership (strict tenant isolation)
      const membership = state.organization_members.find(
        (m) => m.organization_id === requestedOrgId && m.user_id === user.id
      );

      if (!membership) {
        res.status(403).json({
          error: 'Access denied: You do not have permission to access this organization.',
        });
        return;
      }

      const org = state.organizations.find((o) => o.id === requestedOrgId);
      if (!org) {
        res.status(404).json({ error: 'Organization not found.' });
        return;
      }

      req.organization = org;
      req.orgRole = membership.role;
      next();
    });
  };

  const sanitizeProfile = (p: Profile) => {
    const { password_hash: _, ...safe } = p;
    return safe;
  };

  // --------------------------------------------------------------------------
  // AUTH ROUTES
  // --------------------------------------------------------------------------
  const signupSchema = z.object({
    email: z.string().email('Valid email address is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    full_name: z.string().min(2, 'Full name is required'),
    business_name: z.string().optional(),
    business_type: z.string().optional(),
    currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).optional(),
  });

  app.post('/api/auth/signup', (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { email, password, full_name, business_name, business_type, currency } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();
    const state = db.getState();

    if (state.profiles.some((p) => p.email.toLowerCase() === normalizedEmail)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const userId = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    const orgName = (business_name || `${full_name.split(' ')[0]}'s Workspace`).trim();
    const slug =
      orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      orgId.slice(0, 4);

    const newOrg: Organization = {
      id: orgId,
      name: orgName,
      slug,
      business_type: business_type || 'B2B SaaS',
      currency: (currency as CurrencyCode) || 'INR',
      tax_rate: 18,
      tax_id: '',
      billing_email: normalizedEmail,
      address: '',
      country: currency === 'USD' ? 'US' : 'IN',
      invoice_prefix: 'INV',
      grace_period_days: 7,
      auto_retry_failed_payments: true,
      onboarding_completed: Boolean(business_name),
      created_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const newProfile: Profile = {
      id: userId,
      email: normalizedEmail,
      password_hash: hashPassword(password),
      full_name: full_name.trim(),
      job_title: 'Founder & Owner',
      default_organization_id: orgId,
      notification_preferences: {
        failed_payments: true,
        upcoming_renewals: true,
        overdue_invoices: true,
        new_subscriptions: true,
        cancellations: true,
        payment_confirmations: true,
        email_digest: true,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    state.profiles.push(newProfile);
    state.organizations.push(newOrg);
    state.organization_members.push({
      id: crypto.randomUUID(),
      organization_id: orgId,
      user_id: userId,
      role: 'owner',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Seed two starter plans for the new organization so they can immediately create subscriptions
    const starterPlanId = crypto.randomUUID();
    const proPlanId = crypto.randomUUID();
    state.plans.push(
      {
        id: starterPlanId,
        organization_id: orgId,
        code: 'PLN-01',
        name: 'Starter Monthly',
        description: 'Essential recurring subscription plan for new customers.',
        price: newOrg.currency === 'INR' ? 3900 : 49,
        currency: newOrg.currency,
        billing_interval: 'monthly',
        trial_days: 14,
        features: ['Core platform access', 'Automated invoicing', 'Email support'],
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: proPlanId,
        organization_id: orgId,
        code: 'PLN-02',
        name: 'Pro Growth',
        description: 'Full analytics, priority support, and team collaboration.',
        price: newOrg.currency === 'INR' ? 8400 : 99,
        currency: newOrg.currency,
        billing_interval: 'monthly',
        trial_days: 14,
        features: ['Unlimited projects', 'AI Revenue Copilot', 'Priority support'],
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    );

    db.logAudit({
      organization_id: orgId,
      actor_id: userId,
      actor_email: normalizedEmail,
      action: 'user.signup',
      entity_type: 'organization',
      entity_id: orgId,
      metadata: { organization_name: orgName },
    });

    db.commit();
    void db.syncUserToSupabaseAuth(normalizedEmail, password, full_name.trim(), orgId, userId);

    const token = signToken(userId, normalizedEmail);
    res.status(201).json({
      token,
      user: sanitizeProfile(newProfile),
      organizations: [newOrg],
      activeOrganization: newOrg,
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const state = db.getState();
    const user = state.profiles.find((p) => p.email.toLowerCase() === normalizedEmail);

    if (!user || !user.password_hash || !verifyPassword(String(password), user.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const memberOrgIds = state.organization_members
      .filter((m) => m.user_id === user.id)
      .map((m) => m.organization_id);
    const userOrgs = state.organizations.filter((o) => memberOrgIds.includes(o.id));
    const activeOrg =
      userOrgs.find((o) => o.id === user.default_organization_id) || userOrgs[0] || null;

    const token = signToken(user.id, user.email);
    res.json({
      token,
      user: sanitizeProfile(user),
      organizations: userOrgs,
      activeOrganization: activeOrg,
    });
  });

  app.post('/api/auth/demo-login', (_req, res) => {
    const state = db.getState();
    const demoUser = state.profiles.find((p) => p.email === 'aditya@brightloop.io') || state.profiles[0];
    const memberOrgIds = state.organization_members
      .filter((m) => m.user_id === demoUser.id)
      .map((m) => m.organization_id);
    const userOrgs = state.organizations.filter((o) => memberOrgIds.includes(o.id));
    const activeOrg =
      userOrgs.find((o) => o.id === demoUser.default_organization_id) || userOrgs[0];

    const token = signToken(demoUser.id, demoUser.email);
    res.json({
      token,
      user: sanitizeProfile(demoUser),
      organizations: userOrgs,
      activeOrganization: activeOrg,
      isDemo: true,
    });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const { email, new_password } = req.body || {};
    if (!email || !new_password || String(new_password).length < 6) {
      res.status(400).json({
        error: 'Valid email and a new password of at least 6 characters are required.',
      });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const state = db.getState();
    const user = state.profiles.find((p) => p.email.toLowerCase() === normalizedEmail);
    if (!user) {
      res.status(404).json({ error: 'No account found with that email address.' });
      return;
    }

    user.password_hash = hashPassword(String(new_password));
    user.updated_at = new Date().toISOString();
    db.commit();

    res.json({
      message: 'Password updated successfully. You can now sign in with your new password.',
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const state = db.getState();
    const memberOrgIds = state.organization_members
      .filter((m) => m.user_id === user.id)
      .map((m) => m.organization_id);
    const userOrgs = state.organizations.filter((o) => memberOrgIds.includes(o.id));
    const requestedOrgId = req.headers['x-organization-id'] as string;
    const activeOrg =
      userOrgs.find((o) => o.id === requestedOrgId) ||
      userOrgs.find((o) => o.id === user.default_organization_id) ||
      userOrgs[0] ||
      null;
    const sbStatus = db.getSupabaseStatus();

    res.json({
      user: sanitizeProfile(user),
      organizations: userOrgs,
      activeOrganization: activeOrg,
      integrations: {
        supabase: isSupabaseConfigured(),
        supabaseConnected: sbStatus.connected,
        supabasePersistenceMode: sbStatus.persistenceMode,
        supabaseUrl: sbStatus.url,
        gemini: isGeminiConfigured(),
        geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
        paymentsMode: 'demo_only',
        email: isEmailConfigured(),
      },
    });
  });

  app.put('/api/auth/profile', requireAuth, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const { full_name, job_title, notification_preferences, default_organization_id } = req.body || {};

    if (full_name !== undefined) user.full_name = String(full_name).trim();
    if (job_title !== undefined) user.job_title = String(job_title).trim();
    if (default_organization_id !== undefined) {
      user.default_organization_id = default_organization_id;
    }
    if (notification_preferences && typeof notification_preferences === 'object') {
      user.notification_preferences = {
        ...user.notification_preferences,
        ...notification_preferences,
      };
    }
    user.updated_at = new Date().toISOString();
    db.commit();

    res.json({ user: sanitizeProfile(user) });
  });

  // --------------------------------------------------------------------------
  // ORGANIZATIONS & ONBOARDING
  // --------------------------------------------------------------------------
  const orgSchema = z.object({
    name: z.string().min(2, 'Organization name is required'),
    business_type: z.string().default('B2B SaaS'),
    currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).default('INR'),
    tax_rate: z.number().min(0).max(100).default(18),
    tax_id: z.string().optional().default(''),
    billing_email: z.string().email().optional().or(z.literal('')).default(''),
    address: z.string().optional().default(''),
    country: z.string().default('IN'),
    invoice_prefix: z.string().min(2).max(6).default('INV'),
    grace_period_days: z.number().int().min(0).max(90).default(7),
    auto_retry_failed_payments: z.boolean().default(true),
    seed_sample_data: z.boolean().optional().default(false),
  });

  app.post('/api/organizations', requireAuth, (req: AuthenticatedRequest, res) => {
    const parsed = orgSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const user = req.user!;
    const data = parsed.data;
    const state = db.getState();
    const orgId = crypto.randomUUID();
    const slug =
      data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      orgId.slice(0, 4);

    const newOrg: Organization = {
      id: orgId,
      name: data.name.trim(),
      slug,
      business_type: data.business_type,
      currency: data.currency,
      tax_rate: data.tax_rate,
      tax_id: data.tax_id,
      billing_email: data.billing_email || user.email,
      address: data.address,
      country: data.country,
      invoice_prefix: data.invoice_prefix.toUpperCase(),
      grace_period_days: data.grace_period_days,
      auto_retry_failed_payments: data.auto_retry_failed_payments,
      onboarding_completed: true,
      created_by: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    state.organizations.push(newOrg);
    state.organization_members.push({
      id: crypto.randomUUID(),
      organization_id: orgId,
      user_id: user.id,
      role: 'owner',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    user.default_organization_id = orgId;

    if (data.seed_sample_data) {
      db.resetOrganizationDemoData(orgId, user.id);
    } else {
      db.commit();
    }

    res.status(201).json({ organization: newOrg });
  });

  app.put('/api/organizations/:id', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    if (req.params.id !== org.id) {
      res.status(403).json({ error: 'Cannot modify another organization.' });
      return;
    }

    const {
      name,
      business_type,
      currency,
      tax_rate,
      tax_id,
      billing_email,
      address,
      country,
      invoice_prefix,
      grace_period_days,
      auto_retry_failed_payments,
      onboarding_completed,
    } = req.body || {};

    if (name !== undefined && String(name).trim().length >= 2) org.name = String(name).trim();
    if (business_type !== undefined) org.business_type = String(business_type).trim();
    if (currency !== undefined && ['INR', 'USD', 'EUR', 'GBP'].includes(currency)) {
      org.currency = currency;
    }
    if (tax_rate !== undefined) org.tax_rate = Math.min(100, Math.max(0, Number(tax_rate) || 0));
    if (tax_id !== undefined) org.tax_id = String(tax_id).trim();
    if (billing_email !== undefined) org.billing_email = String(billing_email).trim();
    if (address !== undefined) org.address = String(address).trim();
    if (country !== undefined) org.country = String(country).trim();
    if (invoice_prefix !== undefined && String(invoice_prefix).trim()) {
      org.invoice_prefix = String(invoice_prefix).trim().toUpperCase();
    }
    if (grace_period_days !== undefined) {
      org.grace_period_days = Math.min(90, Math.max(0, Number(grace_period_days) || 0));
    }
    if (auto_retry_failed_payments !== undefined) {
      org.auto_retry_failed_payments = Boolean(auto_retry_failed_payments);
    }
    if (onboarding_completed !== undefined) {
      org.onboarding_completed = Boolean(onboarding_completed);
    }

    org.updated_at = new Date().toISOString();

    db.logAudit({
      organization_id: org.id,
      actor_id: req.user!.id,
      actor_email: req.user!.email,
      action: 'organization.updated',
      entity_type: 'organization',
      entity_id: org.id,
      metadata: { name: org.name, onboarding_completed: org.onboarding_completed },
    });

    db.commit();
    res.json({ organization: org });
  });

  app.post('/api/demo/reset', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    db.resetOrganizationDemoData(org.id, req.user!.id);
    res.json({
      message: 'Demo data reset to clean baseline for this organization.',
      organization_id: org.id,
    });
  });

  // --------------------------------------------------------------------------
  // ANALYTICS & OVERVIEW DASHBOARD
  // --------------------------------------------------------------------------
  app.get('/api/analytics/overview', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    db.syncOrganizationHealthAndNotifications(org.id);

    const state = db.getState();
    const range = (req.query.range as string) || '12m';
    const customFrom = req.query.from as string | undefined;
    const customTo = req.query.to as string | undefined;

    const now = new Date('2026-10-31T23:59:59.000Z');
    let dateFrom = new Date('2025-11-01T00:00:00.000Z');
    let dateTo = now;

    if (range === '7d') {
      dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === '30d') {
      dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (range === '90d') {
      dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else if (range === '12m') {
      dateFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    } else if (range === 'custom' && customFrom) {
      dateFrom = new Date(customFrom);
      if (customTo) dateTo = new Date(customTo);
    }

    const customers = state.customers.filter((c) => c.organization_id === org.id);
    const plans = state.plans.filter((p) => p.organization_id === org.id);
    const subscriptions = state.subscriptions.filter((s) => s.organization_id === org.id);
    const invoices = state.invoices.filter((i) => i.organization_id === org.id);
    const payments = state.payments.filter((p) => p.organization_id === org.id);
    const notifications = state.notifications
      .filter((n) => n.organization_id === org.id)
      .slice(0, 20);
    const auditLogs = state.audit_logs
      .filter((a) => a.organization_id === org.id)
      .slice(0, 15);

    const metrics = calculateOrganizationMetrics({
      customers,
      plans,
      subscriptions,
      invoices,
      payments,
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
    });

    // Build historical & projected monthly revenue series from real subscriptions & invoices
    const monthBuckets = [
      { key: '2026-05', label: 'May' },
      { key: '2026-06', label: 'Jun' },
      { key: '2026-07', label: 'Jul' },
      { key: '2026-08', label: 'Aug' },
      { key: '2026-09', label: 'Sep' },
      { key: '2026-10', label: 'Oct' },
    ];

    const revenueSeries = monthBuckets.map((b, idx) => {
      const endOfMonth = new Date(`${b.key}-28T23:59:59.000Z`).getTime();
      const activeSubsAtMonth = subscriptions.filter((s) => {
        const start = new Date(s.start_date).getTime();
        const cancelled = s.cancelled_at ? new Date(s.cancelled_at).getTime() : Number.MAX_SAFE_INTEGER;
        return start <= endOfMonth && cancelled > endOfMonth;
      });
      const mrrAtMonth = roundMoney(
        activeSubsAtMonth.reduce((sum, s) => sum + Number(s.mrr_amount || 0), 0)
      );
      const collectedAtMonth = roundMoney(
        payments
          .filter(
            (p) =>
              (p.status === 'captured' || p.status === 'partially_refunded') &&
              (p.paid_at || p.created_at).startsWith(b.key)
          )
          .reduce((sum, p) => sum + Math.max(0, p.amount - p.refunded_amount), 0)
      );

      return {
        month: b.label,
        mrr: idx === monthBuckets.length - 1 ? metrics.mrr : mrrAtMonth,
        collected: collectedAtMonth,
        forecast: roundMoney(
          (idx === monthBuckets.length - 1 ? metrics.mrr : mrrAtMonth) * 1.03
        ),
        active_customers: activeSubsAtMonth.length,
        is_projection: false,
      };
    });

    // Add 3 months deterministic forward projection clearly flagged with is_projection: true
    const currentMrr = metrics.mrr;
    const netMonthlyGrowthFactor = Math.max(0.95, 1 + 0.045 - metrics.churn_rate / 100);
    ['Nov (Proj)', 'Dec (Proj)', 'Jan (Proj)'].forEach((label, idx) => {
      const projected = roundMoney(currentMrr * Math.pow(netMonthlyGrowthFactor, idx + 1));
      revenueSeries.push({
        month: label,
        mrr: 0,
        collected: 0,
        forecast: projected,
        active_customers: Math.round(
          metrics.active_subscriptions_count * Math.pow(netMonthlyGrowthFactor, idx + 1)
        ),
        is_projection: true,
      });
    });

    res.json({
      organization: org,
      range,
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
      metrics,
      revenueSeries,
      notifications,
      auditLogs,
    });
  });

  // --------------------------------------------------------------------------
  // CUSTOMERS CRUD
  // --------------------------------------------------------------------------
  const customerCreateSchema = z.object({
    name: z.string().min(2, 'Customer name is required'),
    email: z.string().email('Valid customer email is required'),
    phone: z.string().optional().default(''),
    company: z.string().optional().default(''),
    tax_id: z.string().optional().default(''),
    billing_address: z.string().optional().default(''),
    preferred_payment_method: z.string().optional().default('UPI'),
    notes: z.string().optional().default(''),
    initial_plan_id: z.string().optional(),
  });

  app.get('/api/customers', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();

    const search = ((req.query.search as string) || '').toLowerCase().trim();
    const statusFilter = (req.query.status as string) || 'all';
    const sortBy = (req.query.sortBy as string) || 'created_at';
    const sortDir = (req.query.sortDir as string) === 'asc' ? 1 : -1;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

    const orgCustomers = state.customers.filter((c) => c.organization_id === org.id);
    const orgSubs = state.subscriptions.filter((s) => s.organization_id === org.id);
    const orgPlans = state.plans.filter((p) => p.organization_id === org.id);
    const orgInvoices = state.invoices.filter((i) => i.organization_id === org.id);
    const orgPayments = state.payments.filter((p) => p.organization_id === org.id);

    const enriched = orgCustomers.map((c) => {
      const cSubs = orgSubs.filter((s) => s.customer_id === c.id);
      const activeSubs = cSubs.filter(
        (s) => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due'
      );
      const mrr = roundMoney(activeSubs.reduce((sum, s) => sum + Number(s.mrr_amount || 0), 0));
      const primarySub = activeSubs[0] || cSubs[0] || null;
      const primaryPlan = primarySub
        ? orgPlans.find((p) => p.id === primarySub.plan_id) || null
        : null;

      const cPayments = orgPayments.filter(
        (p) =>
          p.customer_id === c.id &&
          (p.status === 'captured' || p.status === 'partially_refunded')
      );
      const lifetimeValue = roundMoney(
        cPayments.reduce((sum, p) => sum + Math.max(0, p.amount - p.refunded_amount), 0)
      );
      const lastPayment = cPayments.sort(
        (a, b) =>
          new Date(b.paid_at || b.created_at).getTime() -
          new Date(a.paid_at || a.created_at).getTime()
      )[0];

      const unpaidInvoicesCount = orgInvoices.filter(
        (i) =>
          i.customer_id === c.id &&
          (i.status === 'pending' || i.status === 'overdue' || i.status === 'payment_failed')
      ).length;

      return {
        ...c,
        mrr,
        lifetime_value: lifetimeValue,
        active_subscriptions_count: activeSubs.length,
        primary_plan_name: primaryPlan ? primaryPlan.name : 'No active plan',
        primary_subscription_id: primarySub ? primarySub.id : null,
        last_payment_date: lastPayment ? lastPayment.paid_at || lastPayment.created_at : null,
        unpaid_invoices_count: unpaidInvoicesCount,
      };
    });

    const filtered = enriched.filter((c) => {
      if (statusFilter === 'all') {
        if (c.status === 'archived') return false;
      } else if (c.status !== statusFilter) {
        return false;
      }
      if (!search) return true;
      return [
        c.name,
        c.email,
        c.external_code,
        c.company,
        c.primary_plan_name,
        c.status,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });

    filtered.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name) * sortDir;
      if (sortBy === 'mrr') return (a.mrr - b.mrr) * sortDir;
      if (sortBy === 'risk_score') return (a.risk_score - b.risk_score) * sortDir;
      if (sortBy === 'ltv') return (a.lifetime_value - b.lifetime_value) * sortDir;
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * sortDir;
    });

    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    res.json({
      customers: paginated,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  });

  app.get('/api/customers/:id', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();

    const customer = state.customers.find(
      (c) => c.id === req.params.id && c.organization_id === org.id
    );
    if (!customer) {
      res.status(404).json({ error: 'Customer not found in your organization.' });
      return;
    }

    const subscriptions = state.subscriptions
      .filter((s) => s.customer_id === customer.id && s.organization_id === org.id)
      .map((s) => ({
        ...s,
        plan: state.plans.find((p) => p.id === s.plan_id) || null,
      }));

    const invoices = state.invoices.filter(
      (i) => i.customer_id === customer.id && i.organization_id === org.id
    );
    const payments = state.payments.filter(
      (p) => p.customer_id === customer.id && p.organization_id === org.id
    );
    const paymentMethods = state.payment_methods.filter(
      (pm) => pm.customer_id === customer.id && pm.organization_id === org.id
    );

    const lifetimeValue = roundMoney(
      payments
        .filter((p) => p.status === 'captured' || p.status === 'partially_refunded')
        .reduce((sum, p) => sum + Math.max(0, p.amount - p.refunded_amount), 0)
    );

    const currentMrr = roundMoney(
      subscriptions
        .filter((s) => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due')
        .reduce((sum, s) => sum + Number(s.mrr_amount || 0), 0)
    );

    res.json({
      customer: {
        ...customer,
        mrr: currentMrr,
        lifetime_value: lifetimeValue,
      },
      subscriptions,
      invoices,
      payments,
      paymentMethods,
    });
  });

  app.post('/api/customers', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const parsed = customerCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const state = db.getState();
    const data = parsed.data;
    const normalizedEmail = data.email.toLowerCase().trim();

    if (
      state.customers.some(
        (c) =>
          c.organization_id === org.id &&
          c.email.toLowerCase() === normalizedEmail &&
          c.status !== 'archived'
      )
    ) {
      res.status(409).json({
        error: 'A customer with this email address already exists in your organization.',
      });
      return;
    }

    const orgCustomersCount = state.customers.filter((c) => c.organization_id === org.id).length;
    const externalCode = `CUS-${1045 + orgCustomersCount}`;

    const newCustomer: Customer = {
      id: crypto.randomUUID(),
      organization_id: org.id,
      external_code: externalCode,
      name: data.name.trim(),
      email: normalizedEmail,
      phone: data.phone.trim(),
      company: (data.company || data.name).trim(),
      tax_id: data.tax_id.trim(),
      billing_address: data.billing_address.trim(),
      currency: org.currency,
      status: 'active',
      risk_score: 12,
      risk_reason: 'New account',
      preferred_payment_method: data.preferred_payment_method || 'UPI',
      notes: data.notes.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    state.customers.push(newCustomer);

    // If an initial plan was selected, create the subscription automatically
    let createdSubscription: Subscription | null = null;
    if (data.initial_plan_id) {
      const plan = state.plans.find(
        (p) => p.id === data.initial_plan_id && p.organization_id === org.id
      );
      if (plan && plan.status === 'active') {
        const nowIso = new Date().toISOString();
        const nextBilling = addBillingInterval(nowIso, plan.billing_interval);
        const subCount = state.subscriptions.filter((s) => s.organization_id === org.id).length;
        createdSubscription = {
          id: crypto.randomUUID(),
          organization_id: org.id,
          customer_id: newCustomer.id,
          plan_id: plan.id,
          code: `SUB-${String(410 + subCount).padStart(4, '0')}`,
          status: plan.trial_days > 0 ? 'trialing' : 'active',
          quantity: 1,
          unit_price: plan.price,
          discount_percent: 0,
          currency: plan.currency,
          billing_interval: plan.billing_interval,
          mrr_amount: calculateSubscriptionMrr(plan.price, 1, plan.billing_interval, 0),
          start_date: nowIso,
          current_period_start: nowIso,
          current_period_end: nextBilling,
          next_billing_date: nextBilling,
          trial_ends_at:
            plan.trial_days > 0
              ? new Date(Date.now() + plan.trial_days * 24 * 60 * 60 * 1000).toISOString()
              : null,
          paused_at: null,
          cancelled_at: null,
          cancel_at_period_end: false,
          cancellation_reason: null,
          created_at: nowIso,
          updated_at: nowIso,
        };
        state.subscriptions.push(createdSubscription);
      }
    }

    db.logAudit({
      organization_id: org.id,
      actor_id: req.user!.id,
      actor_email: req.user!.email,
      action: 'customer.created',
      entity_type: 'customer',
      entity_id: newCustomer.external_code,
      metadata: { name: newCustomer.name, email: newCustomer.email },
    });

    db.commit();
    res.status(201).json({ customer: newCustomer, subscription: createdSubscription });
  });

  app.put('/api/customers/:id', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();
    const customer = state.customers.find(
      (c) => c.id === req.params.id && c.organization_id === org.id
    );
    if (!customer) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }

    const {
      name,
      email,
      phone,
      company,
      tax_id,
      billing_address,
      preferred_payment_method,
      notes,
      status,
    } = req.body || {};

    if (name !== undefined && String(name).trim().length >= 2) {
      customer.name = String(name).trim();
    }
    if (email !== undefined && String(email).includes('@')) {
      customer.email = String(email).toLowerCase().trim();
    }
    if (phone !== undefined) customer.phone = String(phone).trim();
    if (company !== undefined) customer.company = String(company).trim();
    if (tax_id !== undefined) customer.tax_id = String(tax_id).trim();
    if (billing_address !== undefined) customer.billing_address = String(billing_address).trim();
    if (preferred_payment_method !== undefined) {
      customer.preferred_payment_method = String(preferred_payment_method).trim();
    }
    if (notes !== undefined) customer.notes = String(notes).trim();
    if (
      status !== undefined &&
      ['active', 'at_risk', 'past_due', 'churned', 'archived'].includes(status)
    ) {
      customer.status = status;
    }

    customer.updated_at = new Date().toISOString();
    db.logAudit({
      organization_id: org.id,
      actor_id: req.user!.id,
      actor_email: req.user!.email,
      action: 'customer.updated',
      entity_type: 'customer',
      entity_id: customer.external_code,
      metadata: { name: customer.name, status: customer.status },
    });
    db.commit();

    res.json({ customer });
  });

  app.delete('/api/customers/:id', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();
    const customer = state.customers.find(
      (c) => c.id === req.params.id && c.organization_id === org.id
    );
    if (!customer) {
      res.status(404).json({ error: 'Customer not found.' });
      return;
    }

    // Archive customer and cancel any active subscriptions
    customer.status = 'archived';
    customer.updated_at = new Date().toISOString();

    state.subscriptions
      .filter(
        (s) =>
          s.customer_id === customer.id &&
          s.organization_id === org.id &&
          s.status !== 'cancelled'
      )
      .forEach((s) => {
        s.status = 'cancelled';
        s.mrr_amount = 0;
        s.next_billing_date = null;
        s.cancelled_at = new Date().toISOString();
        s.cancellation_reason = 'Customer archived';
        s.updated_at = new Date().toISOString();
      });

    db.logAudit({
      organization_id: org.id,
      actor_id: req.user!.id,
      actor_email: req.user!.email,
      action: 'customer.archived',
      entity_type: 'customer',
      entity_id: customer.external_code,
    });
    db.commit();

    res.json({ message: 'Customer archived and active subscriptions cancelled.', customer });
  });

  // --------------------------------------------------------------------------
  // PLANS CRUD
  // --------------------------------------------------------------------------
  const planSchema = z.object({
    name: z.string().min(2, 'Plan name is required'),
    description: z.string().optional().default(''),
    price: z.number().min(0, 'Price must be non-negative'),
    billing_interval: z.enum(['monthly', 'quarterly', 'yearly', 'weekly']).default('monthly'),
    trial_days: z.number().int().min(0).max(365).default(14),
    features: z.array(z.string()).default([]),
    status: z.enum(['active', 'inactive', 'archived']).default('active'),
  });

  app.get('/api/plans', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();

    const orgPlans = state.plans.filter((p) => p.organization_id === org.id);
    const orgSubs = state.subscriptions.filter((s) => s.organization_id === org.id);

    const enriched = orgPlans.map((plan) => {
      const activeSubs = orgSubs.filter(
        (s) =>
          s.plan_id === plan.id &&
          (s.status === 'active' || s.status === 'trialing' || s.status === 'past_due')
      );
      const mrr = roundMoney(activeSubs.reduce((sum, s) => sum + Number(s.mrr_amount || 0), 0));
      return {
        ...plan,
        active_subscriptions_count: activeSubs.length,
        total_subscriptions_count: orgSubs.filter((s) => s.plan_id === plan.id).length,
        mrr,
      };
    });

    res.json({ plans: enriched });
  });

  app.post('/api/plans', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const state = db.getState();
    const data = parsed.data;
    const planCount = state.plans.filter((p) => p.organization_id === org.id).length;

    const newPlan: Plan = {
      id: crypto.randomUUID(),
      organization_id: org.id,
      code: `PLN-${String(planCount + 1).padStart(2, '0')}`,
      name: data.name.trim(),
      description: data.description.trim(),
      price: roundMoney(data.price),
      currency: org.currency,
      billing_interval: data.billing_interval,
      trial_days: data.trial_days,
      features: data.features.filter(Boolean),
      status: data.status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    state.plans.push(newPlan);
    db.logAudit({
      organization_id: org.id,
      actor_id: req.user!.id,
      actor_email: req.user!.email,
      action: 'plan.created',
      entity_type: 'plan',
      entity_id: newPlan.code,
      metadata: { name: newPlan.name, price: newPlan.price, interval: newPlan.billing_interval },
    });
    db.commit();

    res.status(201).json({ plan: { ...newPlan, active_subscriptions_count: 0, mrr: 0 } });
  });

  app.put('/api/plans/:id', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();
    const plan = state.plans.find((p) => p.id === req.params.id && p.organization_id === org.id);
    if (!plan) {
      res.status(404).json({ error: 'Plan not found.' });
      return;
    }

    const { name, description, price, billing_interval, trial_days, features, status } =
      req.body || {};

    if (name !== undefined && String(name).trim().length >= 2) plan.name = String(name).trim();
    if (description !== undefined) plan.description = String(description).trim();
    if (price !== undefined && Number(price) >= 0) plan.price = roundMoney(Number(price));
    if (
      billing_interval !== undefined &&
      ['monthly', 'quarterly', 'yearly', 'weekly'].includes(billing_interval)
    ) {
      plan.billing_interval = billing_interval;
    }
    if (trial_days !== undefined) {
      plan.trial_days = Math.min(365, Math.max(0, Math.floor(Number(trial_days) || 0)));
    }
    if (Array.isArray(features)) {
      plan.features = features.map((f) => String(f).trim()).filter(Boolean);
    }
    if (status !== undefined && ['active', 'inactive', 'archived'].includes(status)) {
      plan.status = status;
    }

    plan.updated_at = new Date().toISOString();
    db.logAudit({
      organization_id: org.id,
      actor_id: req.user!.id,
      actor_email: req.user!.email,
      action: 'plan.updated',
      entity_type: 'plan',
      entity_id: plan.code,
      metadata: { name: plan.name, price: plan.price, status: plan.status },
    });
    db.commit();

    res.json({ plan });
  });

  app.delete('/api/plans/:id', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();
    const planIndex = state.plans.findIndex(
      (p) => p.id === req.params.id && p.organization_id === org.id
    );
    if (planIndex === -1) {
      res.status(404).json({ error: 'Plan not found.' });
      return;
    }

    const plan = state.plans[planIndex];
    const activeSubs = state.subscriptions.filter(
      (s) =>
        s.plan_id === plan.id &&
        s.organization_id === org.id &&
        s.status !== 'cancelled' &&
        s.status !== 'expired'
    );

    const migrateToPlanId = req.query.migrate_to_plan_id as string | undefined;

    if (activeSubs.length > 0 && !migrateToPlanId) {
      res.status(409).json({
        error: `Cannot delete plan "${plan.name}" because it has ${activeSubs.length} active subscription(s). Archive the plan instead or specify a migration target plan.`,
        active_subscriptions_count: activeSubs.length,
      });
      return;
    }

    if (activeSubs.length > 0 && migrateToPlanId) {
      const targetPlan = state.plans.find(
        (p) => p.id === migrateToPlanId && p.organization_id === org.id
      );
      if (!targetPlan) {
        res.status(400).json({ error: 'Target migration plan not found.' });
        return;
      }
      for (const sub of activeSubs) {
        sub.plan_id = targetPlan.id;
        sub.unit_price = targetPlan.price;
        sub.billing_interval = targetPlan.billing_interval;
        sub.mrr_amount = calculateSubscriptionMrr(
          targetPlan.price,
          sub.quantity,
          targetPlan.billing_interval,
          sub.discount_percent
        );
        sub.updated_at = new Date().toISOString();
      }
    }

    // If historical cancelled subscriptions reference this plan, archive it instead of hard-deleting
    const anySubs = state.subscriptions.some((s) => s.plan_id === plan.id);
    if (anySubs) {
      plan.status = 'archived';
      plan.updated_at = new Date().toISOString();
      db.commit();
      res.json({
        message: 'Plan archived to preserve historical subscription records.',
        plan,
      });
      return;
    }

    state.plans.splice(planIndex, 1);
    db.logAudit({
      organization_id: org.id,
      actor_id: req.user!.id,
      actor_email: req.user!.email,
      action: 'plan.deleted',
      entity_type: 'plan',
      entity_id: plan.code,
    });
    db.commit();

    res.json({ message: 'Plan deleted permanently.' });
  });

  // --------------------------------------------------------------------------
  // SUBSCRIPTIONS & LIFECYCLE MANAGEMENT
  // --------------------------------------------------------------------------
  const subCreateSchema = z.object({
    customer_id: z.string().min(1, 'Customer is required'),
    plan_id: z.string().min(1, 'Plan is required'),
    quantity: z.number().int().min(1).default(1),
    discount_percent: z.number().min(0).max(100).default(0),
    start_trial: z.boolean().optional().default(false),
    generate_invoice: z.boolean().optional().default(true),
  });

  app.get('/api/subscriptions', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();

    const orgSubs = state.subscriptions.filter((s) => s.organization_id === org.id);
    const orgCustomers = state.customers.filter((c) => c.organization_id === org.id);
    const orgPlans = state.plans.filter((p) => p.organization_id === org.id);

    const enriched = orgSubs.map((s) => {
      const customer = orgCustomers.find((c) => c.id === s.customer_id) || null;
      const plan = orgPlans.find((p) => p.id === s.plan_id) || null;
      return {
        ...s,
        customer_name: customer?.name || 'Unknown Customer',
        customer_email: customer?.email || '',
        customer_code: customer?.external_code || '',
        plan_name: plan?.name || 'Custom Plan',
        plan_code: plan?.code || '',
      };
    });

    res.json({ subscriptions: enriched });
  });

  app.post('/api/subscriptions', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const parsed = subCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const state = db.getState();
    const data = parsed.data;

    const customer = state.customers.find(
      (c) => c.id === data.customer_id && c.organization_id === org.id
    );
    if (!customer) {
      res.status(404).json({ error: 'Customer not found in your organization.' });
      return;
    }

    const plan = state.plans.find((p) => p.id === data.plan_id && p.organization_id === org.id);
    if (!plan || plan.status !== 'active') {
      res.status(400).json({ error: 'Selected plan is not active or does not exist.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const hasTrial = data.start_trial && plan.trial_days > 0;
    const trialEnds = hasTrial
      ? new Date(Date.now() + plan.trial_days * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const periodEnd = trialEnds || addBillingInterval(nowIso, plan.billing_interval);
    const mrrAmount = calculateSubscriptionMrr(
      plan.price,
      data.quantity,
      plan.billing_interval,
      data.discount_percent
    );

    const subCount = state.subscriptions.filter((s) => s.organization_id === org.id).length;
    const newSub: Subscription = {
      id: crypto.randomUUID(),
      organization_id: org.id,
      customer_id: customer.id,
      plan_id: plan.id,
      code: `SUB-${String(410 + subCount).padStart(4, '0')}`,
      status: hasTrial ? 'trialing' : 'active',
      quantity: data.quantity,
      unit_price: plan.price,
      discount_percent: data.discount_percent,
      currency: plan.currency,
      billing_interval: plan.billing_interval,
      mrr_amount: mrrAmount,
      start_date: nowIso,
      current_period_start: nowIso,
      current_period_end: periodEnd,
      next_billing_date: periodEnd,
      trial_ends_at: trialEnds,
      paused_at: null,
      cancelled_at: null,
      cancel_at_period_end: false,
      cancellation_reason: null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    state.subscriptions.push(newSub);

    // Create notification for new subscription
    db.createNotificationIfNotExists({
      organization_id: org.id,
      type: 'new_subscription',
      severity: 'success',
      title: `New subscription created for ${customer.name}`,
      message: `${customer.name} subscribed to ${plan.name} (${newSub.code} · ₹${mrrAmount.toLocaleString('en-IN')}/mo MRR).`,
      entity_type: 'subscription',
      entity_id: newSub.id,
      dedup_key: `new_subscription:${newSub.id}`,
    });

    let createdInvoice: Invoice | null = null;
    if (data.generate_invoice && !hasTrial) {
      const grossAmount = roundMoney(plan.price * data.quantity);
      const discountAmt = roundMoney((grossAmount * data.discount_percent) / 100);
      const calc = calculateInvoiceTotals(
        [
          {
            id: 'line-1',
            description: `${plan.name} (${plan.billing_interval}) — ${newSub.code}`,
            quantity: data.quantity,
            unit_price: plan.price,
          },
        ],
        discountAmt,
        org.tax_rate
      );

      const invCount = state.invoices.filter((i) => i.organization_id === org.id).length;
      createdInvoice = {
        id: crypto.randomUUID(),
        organization_id: org.id,
        customer_id: customer.id,
        subscription_id: newSub.id,
        invoice_number: `${org.invoice_prefix}-${2085 + invCount}`,
        status: 'pending',
        currency: org.currency,
        line_items: calc.normalizedItems,
        subtotal: calc.subtotal,
        discount_amount: calc.discount_amount,
        tax_rate: calc.tax_rate,
        tax_amount: calc.tax_amount,
        total_amount: calc.total_amount,
        issue_date: nowIso,
        due_date: new Date(Date.now() + org.grace_period_days * 24 * 60 * 60 * 1000).toISOString(),
        paid_at: null,
        notes: `Initial billing for subscription ${newSub.code}`,
        created_at: nowIso,
        updated_at: nowIso,
      };
      state.invoices.unshift(createdInvoice);
    }

    db.logAudit({
      organization_id: org.id,
      actor_id: req.user!.id,
      actor_email: req.user!.email,
      action: 'subscription.created',
      entity_type: 'subscription',
      entity_id: newSub.code,
      metadata: { customer: customer.name, plan: plan.name, mrr: mrrAmount },
    });

    db.syncOrganizationHealthAndNotifications(org.id);
    db.commit();

    res.status(201).json({ subscription: newSub, invoice: createdInvoice });
  });

  app.put('/api/subscriptions/:id', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();
    const sub = state.subscriptions.find(
      (s) => s.id === req.params.id && s.organization_id === org.id
    );
    if (!sub) {
      res.status(404).json({ error: 'Subscription not found.' });
      return;
    }

    const { plan_id, quantity, discount_percent } = req.body || {};

    if (plan_id && plan_id !== sub.plan_id) {
      const newPlan = state.plans.find((p) => p.id === plan_id && p.organization_id === org.id);
      if (!newPlan) {
        res.status(400).json({ error: 'Target plan not found.' });
        return;
      }
      sub.plan_id = newPlan.id;
      sub.unit_price = newPlan.price;
      sub.billing_interval = newPlan.billing_interval;
    }

    if (quantity !== undefined) {
      sub.quantity = Math.max(1, Math.floor(Number(quantity) || 1));
    }
    if (discount_percent !== undefined) {
      sub.discount_percent = Math.min(100, Math.max(0, Number(discount_percent) || 0));
    }

    if (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due') {
      sub.mrr_amount = calculateSubscriptionMrr(
        sub.unit_price,
        sub.quantity,
        sub.billing_interval,
        sub.discount_percent
      );
    }

    sub.updated_at = new Date().toISOString();
    db.syncOrganizationHealthAndNotifications(org.id);
    db.commit();

    res.json({ subscription: sub });
  });

  app.post(
    '/api/subscriptions/:id/lifecycle',
    requireOrgAccess,
    (req: AuthenticatedRequest, res) => {
      const org = req.organization!;
      const state = db.getState();
      const sub = state.subscriptions.find(
        (s) => s.id === req.params.id && s.organization_id === org.id
      );
      if (!sub) {
        res.status(404).json({ error: 'Subscription not found.' });
        return;
      }

      const customer = state.customers.find((c) => c.id === sub.customer_id);
      const plan = state.plans.find((p) => p.id === sub.plan_id);
      const { action, reason, plan_id, quantity, discount_percent } = req.body || {};
      const nowIso = new Date().toISOString();

      let generatedInvoice: Invoice | null = null;

      switch (action) {
        case 'pause': {
          if (sub.status === 'cancelled') {
            res.status(400).json({ error: 'Cannot pause a cancelled subscription.' });
            return;
          }
          sub.status = 'paused';
          sub.paused_at = nowIso;
          sub.mrr_amount = 0;
          sub.next_billing_date = null;
          sub.updated_at = nowIso;
          break;
        }
        case 'resume': {
          sub.status = 'active';
          sub.paused_at = null;
          sub.cancelled_at = null;
          sub.cancellation_reason = null;
          sub.mrr_amount = calculateSubscriptionMrr(
            sub.unit_price,
            sub.quantity,
            sub.billing_interval,
            sub.discount_percent
          );
          sub.current_period_start = nowIso;
          sub.current_period_end = addBillingInterval(nowIso, sub.billing_interval);
          sub.next_billing_date = sub.current_period_end;
          sub.updated_at = nowIso;
          break;
        }
        case 'cancel': {
          sub.status = 'cancelled';
          sub.cancelled_at = nowIso;
          sub.cancellation_reason = String(reason || 'Customer requested cancellation').trim();
          sub.mrr_amount = 0;
          sub.next_billing_date = null;
          sub.updated_at = nowIso;

          db.createNotificationIfNotExists({
            organization_id: org.id,
            type: 'cancellation',
            severity: 'warning',
            title: `Subscription ${sub.code} cancelled`,
            message: `${customer?.name || 'Customer'} cancelled ${plan?.name || 'subscription'}. Reason: ${sub.cancellation_reason}`,
            entity_type: 'subscription',
            entity_id: sub.id,
            dedup_key: `cancellation:${sub.id}:${nowIso.slice(0, 10)}`,
          });
          break;
        }
        case 'renew': {
          const baseDate = sub.next_billing_date || nowIso;
          const nextPeriodEnd = addBillingInterval(baseDate, sub.billing_interval);
          sub.status = 'active';
          sub.current_period_start = nowIso;
          sub.current_period_end = nextPeriodEnd;
          sub.next_billing_date = nextPeriodEnd;
          sub.mrr_amount = calculateSubscriptionMrr(
            sub.unit_price,
            sub.quantity,
            sub.billing_interval,
            sub.discount_percent
          );
          sub.updated_at = nowIso;

          // Generate renewal invoice
          const gross = roundMoney(sub.unit_price * sub.quantity);
          const disc = roundMoney((gross * sub.discount_percent) / 100);
          const calc = calculateInvoiceTotals(
            [
              {
                id: 'line-1',
                description: `${plan?.name || 'Subscription'} Renewal (${sub.billing_interval}) — ${sub.code}`,
                quantity: sub.quantity,
                unit_price: sub.unit_price,
              },
            ],
            disc,
            org.tax_rate
          );

          const invCount = state.invoices.filter((i) => i.organization_id === org.id).length;
          generatedInvoice = {
            id: crypto.randomUUID(),
            organization_id: org.id,
            customer_id: sub.customer_id,
            subscription_id: sub.id,
            invoice_number: `${org.invoice_prefix}-${2085 + invCount}`,
            status: 'pending',
            currency: org.currency,
            line_items: calc.normalizedItems,
            subtotal: calc.subtotal,
            discount_amount: calc.discount_amount,
            tax_rate: calc.tax_rate,
            tax_amount: calc.tax_amount,
            total_amount: calc.total_amount,
            issue_date: nowIso,
            due_date: new Date(
              Date.now() + org.grace_period_days * 24 * 60 * 60 * 1000
            ).toISOString(),
            paid_at: null,
            notes: `Renewal invoice for ${sub.code}`,
            created_at: nowIso,
            updated_at: nowIso,
          };
          state.invoices.unshift(generatedInvoice);
          break;
        }
        case 'change_plan': {
          const targetPlan = state.plans.find(
            (p) => p.id === plan_id && p.organization_id === org.id
          );
          if (!targetPlan) {
            res.status(400).json({ error: 'Target plan not found.' });
            return;
          }
          sub.plan_id = targetPlan.id;
          sub.unit_price = targetPlan.price;
          sub.billing_interval = targetPlan.billing_interval;
          if (quantity !== undefined) sub.quantity = Math.max(1, Number(quantity) || 1);
          if (discount_percent !== undefined) {
            sub.discount_percent = Math.min(100, Math.max(0, Number(discount_percent) || 0));
          }
          sub.mrr_amount = calculateSubscriptionMrr(
            sub.unit_price,
            sub.quantity,
            sub.billing_interval,
            sub.discount_percent
          );
          sub.updated_at = nowIso;
          break;
        }
        default:
          res.status(400).json({ error: `Unsupported lifecycle action: ${action}` });
          return;
      }

      db.logAudit({
        organization_id: org.id,
        actor_id: req.user!.id,
        actor_email: req.user!.email,
        action: `subscription.${action}`,
        entity_type: 'subscription',
        entity_id: sub.code,
        metadata: { status: sub.status, mrr: sub.mrr_amount, reason: sub.cancellation_reason },
      });

      db.syncOrganizationHealthAndNotifications(org.id);
      db.commit();

      res.json({ subscription: sub, invoice: generatedInvoice });
    }
  );

  // --------------------------------------------------------------------------
  // INVOICES CRUD & SERVER-SIDE TOTAL CALCULATION
  // --------------------------------------------------------------------------
  const invoiceCreateSchema = z.object({
    customer_id: z.string().min(1, 'Customer is required'),
    subscription_id: z.string().nullable().optional(),
    line_items: z
      .array(
        z.object({
          description: z.string().min(1, 'Line item description required'),
          quantity: z.number().min(1),
          unit_price: z.number().min(0),
        })
      )
      .min(1, 'At least one line item is required'),
    discount_amount: z.number().min(0).default(0),
    tax_rate: z.number().min(0).max(100).optional(),
    due_date: z.string().min(1, 'Due date is required'),
    status: z.enum(['draft', 'pending']).default('pending'),
    notes: z.string().optional().default(''),
  });

  app.get('/api/invoices', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();

    const orgInvoices = state.invoices.filter((i) => i.organization_id === org.id);
    const orgCustomers = state.customers.filter((c) => c.organization_id === org.id);

    const enriched = orgInvoices.map((inv) => {
      const customer = orgCustomers.find((c) => c.id === inv.customer_id);
      return {
        ...inv,
        customer_name: customer?.name || 'Unknown Customer',
        customer_email: customer?.email || '',
        customer_company: customer?.company || '',
        customer_tax_id: customer?.tax_id || '',
        customer_address: customer?.billing_address || '',
      };
    });

    res.json({ invoices: enriched });
  });

  app.get('/api/invoices/:id', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();
    const inv = state.invoices.find(
      (i) => i.id === req.params.id && i.organization_id === org.id
    );
    if (!inv) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }
    const customer = state.customers.find((c) => c.id === inv.customer_id) || null;
    const payments = state.payments.filter(
      (p) => p.invoice_id === inv.id && p.organization_id === org.id
    );

    res.json({
      invoice: inv,
      customer,
      organization: org,
      payments,
    });
  });

  app.post('/api/invoices', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const parsed = invoiceCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const state = db.getState();
    const data = parsed.data;

    const customer = state.customers.find(
      (c) => c.id === data.customer_id && c.organization_id === org.id
    );
    if (!customer) {
      res.status(404).json({ error: 'Customer not found in your organization.' });
      return;
    }

    const taxRate = data.tax_rate !== undefined ? data.tax_rate : org.tax_rate;
    const calc = calculateInvoiceTotals(data.line_items, data.discount_amount, taxRate);

    const invCount = state.invoices.filter((i) => i.organization_id === org.id).length;
    const nowIso = new Date().toISOString();

    const newInvoice: Invoice = {
      id: crypto.randomUUID(),
      organization_id: org.id,
      customer_id: customer.id,
      subscription_id: data.subscription_id || null,
      invoice_number: `${org.invoice_prefix}-${2085 + invCount}`,
      status: data.status,
      currency: org.currency,
      line_items: calc.normalizedItems,
      subtotal: calc.subtotal,
      discount_amount: calc.discount_amount,
      tax_rate: calc.tax_rate,
      tax_amount: calc.tax_amount,
      total_amount: calc.total_amount,
      issue_date: nowIso,
      due_date: new Date(data.due_date).toISOString(),
      paid_at: null,
      notes: data.notes.trim(),
      created_at: nowIso,
      updated_at: nowIso,
    };

    state.invoices.unshift(newInvoice);
    db.logAudit({
      organization_id: org.id,
      actor_id: req.user!.id,
      actor_email: req.user!.email,
      action: 'invoice.created',
      entity_type: 'invoice',
      entity_id: newInvoice.invoice_number,
      metadata: { customer: customer.name, total_amount: newInvoice.total_amount },
    });

    db.syncOrganizationHealthAndNotifications(org.id);
    db.commit();

    res.status(201).json({
      invoice: {
        ...newInvoice,
        customer_name: customer.name,
        customer_email: customer.email,
      },
    });
  });

  app.post('/api/invoices/:id/send-reminder', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();
    const inv = state.invoices.find(
      (i) => i.id === req.params.id && i.organization_id === org.id
    );
    if (!inv) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    const customer = state.customers.find((c) => c.id === inv.customer_id);
    const emailConfigured = isEmailConfigured();

    inv.notes = `${inv.notes ? inv.notes + ' · ' : ''}Reminder logged on ${new Date().toISOString().slice(0, 10)}`;
    inv.updated_at = new Date().toISOString();

    db.logAudit({
      organization_id: org.id,
      actor_id: req.user!.id,
      actor_email: req.user!.email,
      action: 'invoice.reminder_logged',
      entity_type: 'invoice',
      entity_id: inv.invoice_number,
      metadata: {
        customer_email: customer?.email,
        email_provider_configured: emailConfigured,
      },
    });
    db.commit();

    res.json({
      invoice: inv,
      emailSent: emailConfigured,
      message: emailConfigured
        ? `Payment reminder emailed to ${customer?.email}`
        : `Dunning reminder logged in workspace for ${customer?.name} (${customer?.email}). Configure RESEND_API_KEY in .env for external email delivery.`,
    });
  });

  // --------------------------------------------------------------------------
  // PAYMENTS — DEMO MODE SIMULATOR ONLY (NO REAL PAYMENT GATEWAY)
  // --------------------------------------------------------------------------
  app.get('/api/payments', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();

    const orgPayments = state.payments.filter((p) => p.organization_id === org.id);
    const orgCustomers = state.customers.filter((c) => c.organization_id === org.id);
    const orgInvoices = state.invoices.filter((i) => i.organization_id === org.id);

    const enriched = orgPayments.map((pay) => {
      const customer = orgCustomers.find((c) => c.id === pay.customer_id);
      const invoice = orgInvoices.find((i) => i.id === pay.invoice_id);
      return {
        ...pay,
        provider: 'simulated_demo' as const,
        is_verified: false,
        customer_name: customer?.name || 'Unknown Customer',
        customer_email: customer?.email || '',
        invoice_number: invoice?.invoice_number || 'Unallocated',
      };
    });

    res.json({
      payments: enriched,
      paymentsMode: 'demo_only',
    });
  });

  /**
   * Explicit Demo Mode Simulated Payment / Failure Endpoint
   * Strictly DEMO MODE ONLY — clearly marks provider as 'simulated_demo' and is_verified: false.
   */
  app.post('/api/payments/simulate', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const {
      invoice_id,
      outcome = 'success',
      payment_method = 'UPI',
      failure_reason = 'Simulated bank decline (Demo Mode)',
    } = req.body || {};

    const state = db.getState();
    const invoice = state.invoices.find(
      (i) => i.id === invoice_id && i.organization_id === org.id
    );
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    if (invoice.status === 'paid' && outcome === 'success') {
      res.status(409).json({ error: 'Invoice is already marked as paid.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const payCount = state.payments.filter((p) => p.organization_id === org.id).length;

    if (outcome === 'failed') {
      invoice.status = 'payment_failed';
      invoice.updated_at = nowIso;

      if (invoice.subscription_id) {
        const sub = state.subscriptions.find((s) => s.id === invoice.subscription_id);
        if (sub && sub.status === 'active') {
          sub.status = 'past_due';
          sub.updated_at = nowIso;
        }
      }

      const failedPayment: Payment = {
        id: crypto.randomUUID(),
        organization_id: org.id,
        customer_id: invoice.customer_id,
        invoice_id: invoice.id,
        subscription_id: invoice.subscription_id,
        payment_number: `PAY-${7006 + payCount}`,
        amount: invoice.total_amount,
        refunded_amount: 0,
        currency: invoice.currency,
        status: 'failed',
        payment_method,
        provider: 'simulated_demo',
        is_verified: false,
        failure_reason,
        paid_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      };

      state.payments.unshift(failedPayment);
      db.syncOrganizationHealthAndNotifications(org.id);
      db.commit();

      res.json({
        simulated: true,
        demoMode: true,
        payment: failedPayment,
        invoice,
        message: 'Simulated failed payment recorded in DEMO MODE.',
      });
      return;
    }

    invoice.status = 'paid';
    invoice.paid_at = nowIso;
    invoice.updated_at = nowIso;

    if (invoice.subscription_id) {
      const sub = state.subscriptions.find((s) => s.id === invoice.subscription_id);
      if (sub && sub.status === 'past_due') {
        sub.status = 'active';
        sub.updated_at = nowIso;
      }
    }

    const simulatedPayment: Payment = {
      id: crypto.randomUUID(),
      organization_id: org.id,
      customer_id: invoice.customer_id,
      invoice_id: invoice.id,
      subscription_id: invoice.subscription_id,
      payment_number: `PAY-${7006 + payCount}`,
      amount: invoice.total_amount,
      refunded_amount: 0,
      currency: invoice.currency,
      status: 'captured',
      payment_method,
      provider: 'simulated_demo',
      is_verified: false,
      paid_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    };

    state.payments.unshift(simulatedPayment);
    const customer = state.customers.find((c) => c.id === invoice.customer_id);

    db.createNotificationIfNotExists({
      organization_id: org.id,
      type: 'payment_confirmation',
      severity: 'success',
      title: `Demo payment recorded for ${customer?.name || 'Customer'}`,
      message: `Simulated DEMO payment ${simulatedPayment.payment_number} (₹${simulatedPayment.amount.toLocaleString('en-IN')}) settled ${invoice.invoice_number}.`,
      entity_type: 'payment',
      entity_id: simulatedPayment.id,
      dedup_key: `payment_confirmation:${simulatedPayment.id}`,
    });

    db.logAudit({
      organization_id: org.id,
      actor_id: req.user!.id,
      actor_email: req.user!.email,
      action: 'payment.simulated',
      entity_type: 'payment',
      entity_id: simulatedPayment.payment_number,
      metadata: { invoice: invoice.invoice_number, amount: simulatedPayment.amount, demo: true },
    });

    db.syncOrganizationHealthAndNotifications(org.id);
    db.commit();

    res.json({
      simulated: true,
      demoMode: true,
      payment: simulatedPayment,
      invoice,
      message: `Simulated DEMO MODE payment recorded for ${invoice.invoice_number}.`,
    });
  });

  app.post('/api/payments/:id/refund', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();
    const payment = state.payments.find(
      (p) => p.id === req.params.id && p.organization_id === org.id
    );
    if (!payment) {
      res.status(404).json({ error: 'Payment not found.' });
      return;
    }

    if (payment.status !== 'captured' && payment.status !== 'partially_refunded') {
      res.status(400).json({ error: 'Only captured payments can be refunded.' });
      return;
    }

    const refundableRemaining = roundMoney(payment.amount - payment.refunded_amount);
    const requestedRefund =
      req.body?.amount !== undefined ? roundMoney(Number(req.body.amount)) : refundableRemaining;

    if (requestedRefund <= 0 || requestedRefund > refundableRemaining) {
      res.status(400).json({
        error: `Refund amount must be between 0.01 and ${refundableRemaining}.`,
      });
      return;
    }

    payment.refunded_amount = roundMoney(payment.refunded_amount + requestedRefund);
    payment.status =
      payment.refunded_amount >= payment.amount ? 'refunded' : 'partially_refunded';
    payment.updated_at = new Date().toISOString();

    if (payment.invoice_id && payment.status === 'refunded') {
      const inv = state.invoices.find((i) => i.id === payment.invoice_id);
      if (inv) {
        inv.status = 'refunded';
        inv.updated_at = new Date().toISOString();
      }
    }

    db.logAudit({
      organization_id: org.id,
      actor_id: req.user!.id,
      actor_email: req.user!.email,
      action: 'payment.refunded',
      entity_type: 'payment',
      entity_id: payment.payment_number,
      metadata: { refunded_amount: requestedRefund, status: payment.status, demo: true },
    });
    db.commit();

    res.json({ payment, demoMode: true });
  });

  app.post('/api/payments/reconcile', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();
    let reconciledCount = 0;

    const orgInvoices = state.invoices.filter((i) => i.organization_id === org.id);
    const orgPayments = state.payments.filter((p) => p.organization_id === org.id);

    for (const pay of orgPayments) {
      if (pay.status === 'captured' && pay.invoice_id) {
        const inv = orgInvoices.find((i) => i.id === pay.invoice_id);
        if (inv && inv.status !== 'paid' && inv.status !== 'refunded') {
          inv.status = 'paid';
          inv.paid_at = pay.paid_at || new Date().toISOString();
          inv.updated_at = new Date().toISOString();
          reconciledCount++;
        }
      }
    }

    const syncStats = db.syncOrganizationHealthAndNotifications(org.id);
    db.commit();

    res.json({
      reconciledCount,
      ...syncStats,
      message:
        reconciledCount > 0
          ? `Reconciled ${reconciledCount} invoice(s) and updated account health scores.`
          : 'All captured demo payments and invoices are in sync.',
    });
  });

  // --------------------------------------------------------------------------
  // NOTIFICATIONS
  // --------------------------------------------------------------------------
  app.get('/api/notifications', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    db.syncOrganizationHealthAndNotifications(org.id);
    const state = db.getState();
    const list = state.notifications.filter((n) => n.organization_id === org.id);
    res.json({ notifications: list });
  });

  app.put('/api/notifications/:id/read', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();
    const notif = state.notifications.find(
      (n) => n.id === req.params.id && n.organization_id === org.id
    );
    if (!notif) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }
    notif.is_read = true;
    db.commit();
    res.json({ notification: notif });
  });

  app.post('/api/notifications/read-all', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();
    state.notifications
      .filter((n) => n.organization_id === org.id)
      .forEach((n) => {
        n.is_read = true;
      });
    db.commit();
    res.json({ message: 'All notifications marked as read.' });
  });

  // --------------------------------------------------------------------------
  // BUSINESS SIMULATOR & REVENUE FORECASTING
  // --------------------------------------------------------------------------
  app.post('/api/simulator/calculate', requireOrgAccess, (req: AuthenticatedRequest, res) => {
    const org = req.organization!;
    const state = db.getState();

    const customers = state.customers.filter((c) => c.organization_id === org.id);
    const plans = state.plans.filter((p) => p.organization_id === org.id);
    const subscriptions = state.subscriptions.filter((s) => s.organization_id === org.id);
    const invoices = state.invoices.filter((i) => i.organization_id === org.id);
    const payments = state.payments.filter((p) => p.organization_id === org.id);

    const actualMetrics = calculateOrganizationMetrics({
      customers,
      plans,
      subscriptions,
      invoices,
      payments,
    });

    const simulation = runDeterministicSimulation({
      baseline_mrr: req.body?.baseline_mrr ?? actualMetrics.mrr,
      baseline_subscribers:
        req.body?.baseline_subscribers ?? actualMetrics.active_subscriptions_count,
      arpu: req.body?.arpu ?? actualMetrics.arpu,
      price_change_percent: Number(req.body?.price_change_percent ?? 0),
      monthly_churn_percent: Number(req.body?.monthly_churn_percent ?? actualMetrics.churn_rate),
      baseline_churn_percent: actualMetrics.churn_rate || 3.5,
      new_customers_per_month: Number(req.body?.new_customers_per_month ?? 4),
      conversion_rate_percent: Number(req.body?.conversion_rate_percent ?? 25),
      payment_failure_percent: Number(req.body?.payment_failure_percent ?? 4),
      recovery_rate_percent: Number(req.body?.recovery_rate_percent ?? 60),
      discount_percent: Number(req.body?.discount_percent ?? 0),
      months: 12,
    });

    res.json({
      actualBaseline: {
        mrr: actualMetrics.mrr,
        arr: actualMetrics.arr,
        active_subscriptions: actualMetrics.active_subscriptions_count,
        arpu: actualMetrics.arpu,
        churn_rate: actualMetrics.churn_rate,
      },
      simulation,
    });
  });

  // --------------------------------------------------------------------------
  // REAL AI REVENUE COPILOT (Google Gemini API + Backend Financial Context)
  // --------------------------------------------------------------------------
  app.post(
    '/api/ai/copilot',
    aiLimiter,
    requireOrgAccess,
    async (req: AuthenticatedRequest, res) => {
      const org = req.organization!;
      const { message, history = [], allowDeterministicFallback = false } = req.body || {};

      if (!message || !String(message).trim()) {
        res.status(400).json({ error: 'Please provide a question for the Revenue Copilot.' });
        return;
      }

      const state = db.getState();
      const customers = state.customers.filter((c) => c.organization_id === org.id);
      const plans = state.plans.filter((p) => p.organization_id === org.id);
      const subscriptions = state.subscriptions.filter((s) => s.organization_id === org.id);
      const invoices = state.invoices.filter((i) => i.organization_id === org.id);
      const payments = state.payments.filter((p) => p.organization_id === org.id);

      const metrics = calculateOrganizationMetrics({
        customers,
        plans,
        subscriptions,
        invoices,
        payments,
      });

      const atRiskCustomers = customers
        .filter((c) => c.status === 'at_risk' || c.status === 'past_due' || c.risk_score >= 60)
        .sort((a, b) => b.risk_score - a.risk_score)
        .map((c) => {
          const cSubs = subscriptions.filter(
            (s) =>
              s.customer_id === c.id &&
              (s.status === 'active' || s.status === 'past_due' || s.status === 'trialing')
          );
          const mrr = roundMoney(cSubs.reduce((sum, s) => sum + s.mrr_amount, 0));
          return {
            name: c.name,
            code: c.external_code,
            status: c.status,
            risk_score: c.risk_score,
            reason: c.risk_reason,
            mrr,
          };
        });

      const unpaidInvoices = invoices
        .filter(
          (i) =>
            i.status === 'overdue' || i.status === 'payment_failed' || i.status === 'pending'
        )
        .map((i) => {
          const c = customers.find((cust) => cust.id === i.customer_id);
          return {
            invoice_number: i.invoice_number,
            customer: c?.name || 'Unknown',
            status: i.status,
            total_amount: i.total_amount,
            due_date: i.due_date.slice(0, 10),
          };
        });

      const priceIncrease10PctImpact = roundMoney(metrics.mrr * 0.1);

      const businessContext = {
        organization: {
          name: org.name,
          currency: org.currency,
          business_type: org.business_type,
        },
        financial_metrics: {
          current_mrr: metrics.mrr,
          active_mrr: metrics.active_mrr,
          past_due_mrr: metrics.past_due_mrr,
          arr: metrics.arr,
          mrr_at_risk: metrics.mrr_at_risk,
          collected_revenue: metrics.collected_revenue,
          outstanding_revenue: metrics.outstanding_revenue,
          overdue_revenue: metrics.overdue_revenue,
          failed_payment_amount: metrics.failed_payment_amount,
          churn_rate_percent: metrics.churn_rate,
          collection_rate_percent: metrics.collection_rate,
          active_subscriptions_count: metrics.active_subscriptions_count,
          arpu: metrics.arpu,
          ten_percent_price_increase_monthly_lift: priceIncrease10PctImpact,
        },
        plan_performance: metrics.plan_performance,
        at_risk_customers: atRiskCustomers,
        unpaid_and_failed_invoices: unpaidInvoices,
      };

      const buildDeterministicReply = (rawQuestion: string) => {
        const q = rawQuestion.toLowerCase();
        if (q.includes('mrr') || q.includes('arr') || q.includes('current')) {
          return `**Current Recurring Revenue (${org.name}):**\n- **Total MRR:** ₹${metrics.mrr.toLocaleString('en-IN')} (₹${metrics.active_mrr.toLocaleString('en-IN')} active + ₹${metrics.past_due_mrr.toLocaleString('en-IN')} past due)\n- **Annualized Run Rate (ARR):** ₹${metrics.arr.toLocaleString('en-IN')}\n- **Active Subscriptions:** ${metrics.active_subscriptions_count} across ${metrics.total_customers_count} customers (ARPU: ₹${metrics.arpu.toLocaleString('en-IN')}/mo).`;
        }
        if (q.includes('risk') || q.includes('churn') || q.includes('attention')) {
          const topRisk = atRiskCustomers
            .map(
              (c) =>
                `- **${c.name}** (${c.code}): Risk score **${c.risk_score}/100** · ₹${c.mrr.toLocaleString('en-IN')}/mo MRR · *${c.reason}*`
            )
            .join('\n');
          return `**Churn & Risk Analysis:**\n- **MRR at Risk:** ₹${metrics.mrr_at_risk.toLocaleString('en-IN')}/mo across ${atRiskCustomers.length} accounts.\n- **Current Churn Rate:** ${metrics.churn_rate}%\n\n**Priority Accounts Requiring Intervention:**\n${topRisk || '- No high-risk accounts detected.'}`;
        }
        if (q.includes('fail') || q.includes('overdue') || q.includes('recover') || q.includes('invoice')) {
          const invList = unpaidInvoices
            .map(
              (i) =>
                `- **${i.invoice_number}** (${i.customer}): ₹${i.total_amount.toLocaleString('en-IN')} · Status: **${i.status.replace('_', ' ')}** (Due ${i.due_date})`
            )
            .join('\n');
          return `**Payment Recovery & Outstanding Invoices:**\n- **Total Outstanding:** ₹${metrics.outstanding_revenue.toLocaleString('en-IN')} (${metrics.unpaid_invoices_count} unpaid invoices)\n- **Failed Payments:** ₹${metrics.failed_payment_amount.toLocaleString('en-IN')}\n- **Overdue Invoices:** ₹${metrics.overdue_revenue.toLocaleString('en-IN')}\n\n**Actionable Invoices:**\n${invList || '- All invoices are settled.'}`;
        }
        if (q.includes('plan') || q.includes('most revenue')) {
          const sortedPlans = [...metrics.plan_performance].sort((a, b) => b.mrr - a.mrr);
          const planLines = sortedPlans
            .map(
              (p) =>
                `- **${p.name}** (${p.code}): ₹${p.mrr.toLocaleString('en-IN')}/mo MRR (${p.share_percent}% share · ${p.active_subscriptions} active subs)`
            )
            .join('\n');
          return `**Subscription Plan Performance (Ranked by MRR):**\n${planLines}`;
        }
        if (q.includes('10%') || q.includes('price') || q.includes('forecast') || q.includes('project')) {
          return `**Pricing & Revenue Projection Analysis:**\n- **Current Baseline MRR:** ₹${metrics.mrr.toLocaleString('en-IN')}/mo\n- **+10% Price Increase Impact (Zero Churn):** +₹${priceIncrease10PctImpact.toLocaleString('en-IN')}/mo (New MRR: ₹${roundMoney(metrics.mrr * 1.1).toLocaleString('en-IN')}/mo, ARR: ₹${roundMoney(metrics.mrr * 1.1 * 12).toLocaleString('en-IN')})\n- **Recommendation:** Apply the 10% increase to new subscribers and annual renewals first while recovering ₹${metrics.outstanding_revenue.toLocaleString('en-IN')} in unpaid invoices.`;
        }
        return `**Executive Summary for ${org.name}:**\n- **MRR / ARR:** ₹${metrics.mrr.toLocaleString('en-IN')}/mo (₹${metrics.arr.toLocaleString('en-IN')}/yr)\n- **Collected Revenue:** ₹${metrics.collected_revenue.toLocaleString('en-IN')} (${metrics.collection_rate}% collection rate)\n- **Outstanding / At Risk:** ₹${metrics.outstanding_revenue.toLocaleString('en-IN')} unpaid across ${unpaidInvoices.length} invoices; ₹${metrics.mrr_at_risk.toLocaleString('en-IN')}/mo MRR at risk across ${atRiskCustomers.length} accounts.\n- **Top Plan:** ${[...metrics.plan_performance].sort((a, b) => b.mrr - a.mrr)[0]?.name || 'N/A'}`;
      };

      if (!isGeminiConfigured()) {
        if (!allowDeterministicFallback) {
          res.status(503).json({
            configured: false,
            mode: 'unconfigured',
            error:
              'Google Gemini API key is not configured. Set GEMINI_API_KEY in your .env file to enable live Gemini AI responses, or enable the Deterministic SQL/Analytics Engine toggle to query your real database metrics.',
            contextSummary: businessContext.financial_metrics,
          });
          return;
        }

        res.json({
          configured: false,
          mode: 'deterministic_analytics_engine',
          answer: buildDeterministicReply(String(message)),
          context: businessContext.financial_metrics,
        });
        return;
      }

      try {
        const systemInstruction = `You are Revive AI Revenue Copilot, a senior SaaS CFO and subscription revenue analyst for "${org.name}".
You must ONLY use the exact aggregated database figures provided below. Never invent customer names, invoice numbers, or financial metrics.
Format monetary amounts in ${org.currency} (using ₹ for INR) and provide concise, actionable, executive-level recommendations covering revenue insights, churn analysis, subscription analysis, forecasting, and dunning recovery.

LIVE DATABASE METRICS & RECORDS FOR ${org.name}:
${JSON.stringify(businessContext, null, 2)}`;

        const geminiResult = await generateWithGemini({
          systemInstruction,
          history: Array.isArray(history) ? history : [],
          userMessage: String(message),
        });

        res.json({
          configured: true,
          mode: 'gemini_live',
          model: geminiResult.resolvedModel,
          requestedModel: geminiResult.requestedModel,
          answer: geminiResult.answer,
          context: businessContext.financial_metrics,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Google Gemini API request failed';
        if (allowDeterministicFallback) {
          res.json({
            configured: true,
            mode: 'deterministic_analytics_engine',
            warning: errMsg,
            answer: `${buildDeterministicReply(String(message))}\n\n*(Note: Live Gemini API returned "${errMsg}" — showing grounded database metrics from the Deterministic SQL/Analytics Engine.)*`,
            context: businessContext.financial_metrics,
          });
          return;
        }
        res.status(502).json({
          configured: true,
          mode: 'gemini_error',
          error: errMsg,
          contextSummary: businessContext.financial_metrics,
        });
      }
    }
  );

  return app;
}
