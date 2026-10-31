import React, { useState } from 'react';
import { Building2, CheckCircle2, Sparkles, X } from 'lucide-react';
import { apiRequest, setStoredOrgId } from '../api';
import { CurrencyCode, Organization } from '../../server/types';

interface OnboardingModalProps {
  organization?: Organization | null;
  isCreatingNew?: boolean;
  onClose: () => void;
  onCompleted: (org: Organization) => void;
}

export function OnboardingModal({
  organization,
  isCreatingNew = false,
  onClose,
  onCompleted,
}: OnboardingModalProps) {
  const [name, setName] = useState(isCreatingNew ? '' : organization?.name || '');
  const [businessType, setBusinessType] = useState(
    isCreatingNew ? 'B2B SaaS' : organization?.business_type || 'B2B SaaS'
  );
  const [currency, setCurrency] = useState<CurrencyCode>(
    isCreatingNew ? 'INR' : organization?.currency || 'INR'
  );
  const [taxRate, setTaxRate] = useState(
    isCreatingNew ? '18' : String(organization?.tax_rate ?? 18)
  );
  const [taxId, setTaxId] = useState(isCreatingNew ? '' : organization?.tax_id || '');
  const [billingEmail, setBillingEmail] = useState(
    isCreatingNew ? '' : organization?.billing_email || ''
  );
  const [address, setAddress] = useState(isCreatingNew ? '' : organization?.address || '');
  const [invoicePrefix, setInvoicePrefix] = useState(
    isCreatingNew ? 'INV' : organization?.invoice_prefix || 'INV'
  );
  const [gracePeriodDays, setGracePeriodDays] = useState(
    isCreatingNew ? '7' : String(organization?.grace_period_days ?? 7)
  );
  const [autoRetry, setAutoRetry] = useState(
    isCreatingNew ? true : (organization?.auto_retry_failed_payments ?? true)
  );
  const [seedSampleData, setSeedSampleData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isCreatingNew || !organization) {
        const res = await apiRequest('/api/organizations', {
          method: 'POST',
          body: JSON.stringify({
            name,
            business_type: businessType,
            currency,
            tax_rate: Number(taxRate) || 0,
            tax_id: taxId,
            billing_email: billingEmail,
            address,
            country: currency === 'INR' ? 'IN' : 'US',
            invoice_prefix: invoicePrefix || 'INV',
            grace_period_days: Number(gracePeriodDays) || 7,
            auto_retry_failed_payments: autoRetry,
            seed_sample_data: seedSampleData,
          }),
        });
        setStoredOrgId(res.organization.id);
        onCompleted(res.organization);
      } else {
        const res = await apiRequest(`/api/organizations/${organization.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name,
            business_type: businessType,
            currency,
            tax_rate: Number(taxRate) || 0,
            tax_id: taxId,
            billing_email: billingEmail,
            address,
            invoice_prefix: invoicePrefix || 'INV',
            grace_period_days: Number(gracePeriodDays) || 7,
            auto_retry_failed_payments: autoRetry,
            onboarding_completed: true,
          }),
        });
        if (seedSampleData) {
          await apiRequest('/api/demo/reset', { method: 'POST' });
        }
        onCompleted(res.organization);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save organization configuration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="eyebrow">ORGANIZATION ONBOARDING</div>
            <h2>{isCreatingNew ? 'Create New Organization' : 'Configure Your Organization'}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        {error && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}

        <form onSubmit={handleSubmit} className="form-stack">
          <div className="form-row">
            <label>
              Business / Legal Name *
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Brightloop Software Pvt Ltd"
              />
            </label>
            <label>
              Industry / Business Type
              <select value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
                <option value="B2B SaaS">B2B SaaS</option>
                <option value="AI & Cloud Infrastructure">AI & Cloud Infrastructure</option>
                <option value="Fintech & Financial Services">Fintech & Financial Services</option>
                <option value="E-Commerce & D2C Subscription">E-Commerce & D2C Subscription</option>
                <option value="Agency & Retainer Services">Agency & Retainer Services</option>
              </select>
            </label>
          </div>

          <div className="form-row">
            <label>
              Default Currency
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              >
                <option value="INR">INR (₹) — Indian Rupee</option>
                <option value="USD">USD ($) — US Dollar</option>
                <option value="EUR">EUR (€) — Euro</option>
                <option value="GBP">GBP (£) — British Pound</option>
              </select>
            </label>
            <label>
              Default Tax / GST Rate (%)
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
                placeholder="e.g. 29AABCB1234F1Z5"
              />
            </label>
            <label>
              Billing Contact Email
              <input
                type="email"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
                placeholder="billing@company.com"
              />
            </label>
          </div>

          <label>
            Registered Business Address
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, City, State, Postal Code"
            />
          </label>

          <div className="form-row">
            <label>
              Invoice Number Prefix
              <input
                required
                maxLength={6}
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                placeholder="INV"
              />
            </label>
            <label>
              Payment Grace Period (Days)
              <input
                type="number"
                min="0"
                max="60"
                value={gracePeriodDays}
                onChange={(e) => setGracePeriodDays(e.target.value)}
              />
            </label>
          </div>

          <label
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              background: 'var(--bg-subtle)',
              borderRadius: 5,
              border: '1px solid var(--border-subtle)',
            }}
          >
            <input
              type="checkbox"
              style={{ width: 16, height: 16 }}
              checked={autoRetry}
              onChange={(e) => setAutoRetry(e.target.checked)}
            />
            <span>Automatically schedule smart retries for failed recurring payments</span>
          </label>

          <label
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              background: 'var(--bg-subtle)',
              borderRadius: 5,
              border: '1px solid var(--border-subtle)',
            }}
          >
            <input
              type="checkbox"
              style={{ width: 16, height: 16 }}
              checked={seedSampleData}
              onChange={(e) => setSeedSampleData(e.target.checked)}
            />
            <span>
              Populate workspace with sample customers, subscriptions, and invoices for testing
            </span>
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={loading}>
              <CheckCircle2 size={14} />
              {loading
                ? 'Saving...'
                : isCreatingNew
                  ? 'Create Organization'
                  : 'Complete Setup'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
