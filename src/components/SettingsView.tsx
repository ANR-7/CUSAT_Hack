import React, { useState } from 'react';
import {
  Bell,
  Building2,
  CheckCircle2,
  Database,
  KeyRound,
  RotateCcw,
  Save,
  ShieldCheck,
  User,
} from 'lucide-react';
import { apiRequest } from '../api';
import { CurrencyCode, Organization, Profile } from '../../server/types';

interface SettingsViewProps {
  user: Profile;
  organization: Organization;
  integrations: {
    supabase: boolean;
    supabaseConnected?: boolean;
    supabasePersistenceMode?: string;
    gemini: boolean;
    geminiModel?: string;
    paymentsMode?: string;
    email: boolean;
  };
  onUpdated: () => void;
  notify: (msg: string) => void;
}

export function SettingsView({
  user,
  organization,
  integrations,
  onUpdated,
  notify,
}: SettingsViewProps) {
  const [orgName, setOrgName] = useState(organization.name);
  const [businessType, setBusinessType] = useState(organization.business_type);
  const [currency, setCurrency] = useState<CurrencyCode>(organization.currency);
  const [taxRate, setTaxRate] = useState(String(organization.tax_rate));
  const [taxId, setTaxId] = useState(organization.tax_id || '');
  const [billingEmail, setBillingEmail] = useState(organization.billing_email || '');
  const [address, setAddress] = useState(organization.address || '');
  const [invoicePrefix, setInvoicePrefix] = useState(organization.invoice_prefix || 'INV');
  const [graceDays, setGraceDays] = useState(String(organization.grace_period_days ?? 7));
  const [autoRetry, setAutoRetry] = useState(organization.auto_retry_failed_payments);

  const [fullName, setFullName] = useState(user.full_name);
  const [jobTitle, setJobTitle] = useState(user.job_title || '');
  const [prefs, setPrefs] = useState(user.notification_preferences);
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [resetting, setResetting] = useState(false);

  const saveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOrg(true);
    try {
      await apiRequest(`/api/organizations/${organization.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: orgName,
          business_type: businessType,
          currency,
          tax_rate: Number(taxRate) || 0,
          tax_id: taxId,
          billing_email: billingEmail,
          address,
          invoice_prefix: invoicePrefix,
          grace_period_days: Number(graceDays) || 7,
          auto_retry_failed_payments: autoRetry,
        }),
      });
      notify('Organization settings saved');
      onUpdated();
    } catch (err: any) {
      notify(err.message || 'Failed to update organization');
    } finally {
      setSavingOrg(false);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await apiRequest('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          full_name: fullName,
          job_title: jobTitle,
          notification_preferences: prefs,
        }),
      });
      notify('User profile and notification preferences saved');
      onUpdated();
    } catch (err: any) {
      notify(err.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleResetDemo = async () => {
    setResetting(true);
    try {
      await apiRequest('/api/demo/reset', { method: 'POST' });
      notify('Demo workspace data reset to baseline');
      onUpdated();
    } catch (err: any) {
      notify(err.message || 'Failed to reset demo data');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">WORKSPACE ADMINISTRATION</div>
          <h1>Settings & Integrations</h1>
          <p>
            Configure organization billing parameters, notification rules, and external service
            integrations.
          </p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={handleResetDemo}
            disabled={resetting}
          >
            <RotateCcw size={14} /> {resetting ? 'Resetting...' : 'Reset Demo Data'}
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Organization & Billing Settings</h2>
              <p>Used on generated PDF tax invoices and subscription lifecycle rules</p>
            </div>
            <Building2 size={16} style={{ color: 'var(--text-muted)' }} />
          </div>
          <form onSubmit={saveOrg} className="form-stack" style={{ padding: 18 }}>
            <div className="form-row">
              <label>
                Organization Name
                <input
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </label>
              <label>
                Business Category
                <input
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                Currency
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </label>
              <label>
                Tax / GST Rate (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                Tax ID / GSTIN
                <input
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="29AABCB1234F1Z5"
                />
              </label>
              <label>
                Billing Support Email
                <input
                  type="email"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                />
              </label>
            </div>

            <label>
              Registered Address
              <input value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>

            <div className="form-row">
              <label>
                Invoice Prefix
                <input
                  value={invoicePrefix}
                  maxLength={6}
                  onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                />
              </label>
              <label>
                Grace Period (Days)
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={graceDays}
                  onChange={(e) => setGraceDays(e.target.value)}
                />
              </label>
            </div>

            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                style={{ width: 16, height: 16 }}
                checked={autoRetry}
                onChange={(e) => setAutoRetry(e.target.checked)}
              />
              <span>Automatically retry failed subscription payments during grace period</span>
            </label>

            <div>
              <button type="submit" className="primary-button" disabled={savingOrg}>
                <Save size={14} /> {savingOrg ? 'Saving...' : 'Save Organization Settings'}
              </button>
            </div>
          </form>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Profile & Notification Preferences</h2>
                <p>Control which billing alerts are generated for your account</p>
              </div>
              <Bell size={16} style={{ color: 'var(--text-muted)' }} />
            </div>
            <form onSubmit={saveProfile} className="form-stack" style={{ padding: 18 }}>
              <div className="form-row">
                <label>
                  Full Name
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </label>
                <label>
                  Role / Job Title
                  <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                </label>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  padding: 12,
                  background: 'var(--bg-subtle)',
                  borderRadius: 6,
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {(
                  [
                    ['failed_payments', 'Failed payment alerts'],
                    ['upcoming_renewals', 'Upcoming renewals (7 days)'],
                    ['overdue_invoices', 'Overdue invoice alerts'],
                    ['new_subscriptions', 'New subscription events'],
                    ['cancellations', 'Subscription cancellations'],
                    ['payment_confirmations', 'Payment confirmations'],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      color: 'var(--text-primary)',
                    }}
                  >
                    <input
                      type="checkbox"
                      style={{ width: 15, height: 15 }}
                      checked={Boolean(prefs[key])}
                      onChange={(e) =>
                        setPrefs({ ...prefs, [key]: e.target.checked })
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <div>
                <button type="submit" className="primary-button" disabled={savingProfile}>
                  <Save size={14} /> {savingProfile ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Service Integrations Status</h2>
                <p>Live connection status of external APIs configured in .env</p>
              </div>
              <KeyRound size={16} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                {
                  name: 'Supabase PostgreSQL, Auth & Cloud Storage',
                  live: integrations.supabase,
                  desc: integrations.supabase
                    ? `Connected to live Supabase project (${integrations.supabasePersistenceMode || 'supabase_cloud'})`
                    : 'Using persistent local relational database (server/data/db.Runtime.json)',
                },
                {
                  name: 'Google Gemini Revenue Copilot API',
                  live: integrations.gemini,
                  desc: integrations.gemini
                    ? `Connected to Google Gemini API (${integrations.geminiModel || 'gemini-3.8-flash'}) server-side`
                    : 'GEMINI_API_KEY not set; Deterministic Analytics Engine available',
                },
                {
                  name: 'Demo Payment Simulator (DEMO MODE ONLY)',
                  live: false,
                  desc: 'Payments operate strictly in DEMO MODE — supports simulated successful and failed payments, receipts, and refunds',
                },
                {
                  name: 'Transactional Email Provider',
                  live: integrations.email,
                  desc: integrations.email
                    ? 'Connected via Resend API'
                    : 'RESEND_API_KEY not set; reminders logged in workspace audit log',
                },
              ].map((item) => (
                <div
                  key={item.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-subtle)',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 12, display: 'block' }}>{item.name}</strong>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {item.desc}
                    </span>
                  </div>
                  <span className={`status-pill ${item.live ? 'active' : 'pending'}`}>
                    <i />
                    {item.live ? 'Configured' : 'Local / Demo'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
