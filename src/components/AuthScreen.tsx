import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  Building2,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  Play,
  ShieldCheck,
  User,
} from 'lucide-react';
import { apiRequest, setStoredOrgId, setStoredToken } from '../api';
import { CurrencyCode, Organization, Profile } from '../../server/types';

interface AuthScreenProps {
  onAuthenticated: (data: {
    user: Profile;
    organizations: Organization[];
    activeOrganization: Organization;
    isNewOnboarding?: boolean;
  }) => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('aditya@brightloop.io');
  const [password, setPassword] = useState('ReviveDemo#2026');
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('B2B SaaS');
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleDemoLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest('/api/auth/demo-login', { method: 'POST' });
      setStoredToken(res.token);
      if (res.activeOrganization?.id) {
        setStoredOrgId(res.activeOrganization.id);
      }
      onAuthenticated({
        user: res.user,
        organizations: res.organizations,
        activeOrganization: res.activeOrganization,
      });
    } catch (err: any) {
      setError(err.message || 'Demo login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        setStoredToken(res.token);
        if (res.activeOrganization?.id) {
          setStoredOrgId(res.activeOrganization.id);
        }
        onAuthenticated({
          user: res.user,
          organizations: res.organizations,
          activeOrganization: res.activeOrganization,
        });
      } else if (mode === 'signup') {
        const res = await apiRequest('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            full_name: fullName,
            business_name: businessName || undefined,
            business_type: businessType,
            currency,
          }),
        });
        setStoredToken(res.token);
        if (res.activeOrganization?.id) {
          setStoredOrgId(res.activeOrganization.id);
        }
        onAuthenticated({
          user: res.user,
          organizations: res.organizations,
          activeOrganization: res.activeOrganization,
          isNewOnboarding: true,
        });
      } else if (mode === 'reset') {
        const res = await apiRequest('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ email, new_password: password }),
        });
        setSuccessMsg(res.message || 'Password updated! Please sign in.');
        setMode('login');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-showcase">
        <div className="brand">
          <div className="brand-mark">
            <Activity size={17} />
          </div>
          <div>
            <div className="brand-name">
              revive<span>.</span>
            </div>
            <div className="brand-sub">SUBSCRIPTION INTELLIGENCE</div>
          </div>
        </div>

        <div className="auth-showcase-body">
          <div className="eyebrow">ENTERPRISE REVENUE OPERATIONS</div>
          <h1>Control recurring revenue, prevent churn, and automate billing.</h1>
          <p>
            Revive unifies subscription lifecycle management, GST-compliant invoicing, simulated
            demo payment collections, deterministic scenario modeling, and a Google Gemini AI
            Revenue Copilot grounded in your live ledger.
          </p>

          <div className="auth-feature-list">
            <div className="auth-feature-item">
              <strong>Subscription Lifecycle Engine</strong>
              <span>
                Create, upgrade, pause, resume, and cancel plans with accurate MRR & ARR
                normalization.
              </span>
            </div>
            <div className="auth-feature-item">
              <strong>Demo Payment Simulator (DEMO MODE)</strong>
              <span>
                Simulate successful and failed payments, invoice settlements, receipts, and refunds
                safely in Demo Mode.
              </span>
            </div>
            <div className="auth-feature-item">
              <strong>Google Gemini AI Revenue Copilot</strong>
              <span>
                Context-aware insights powered by Google Gemini and exact server-side financial
                aggregations.
              </span>
            </div>
            <div className="auth-feature-item">
              <strong>Multi-Tenant Security & Supabase</strong>
              <span>
                Organization-level data isolation enforced via Row Level Security and strict API
                guards.
              </span>
            </div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
          <span>SOC2 & RLS Tenant Isolated</span>
          <span>·</span>
          <span>Google Gemini AI Copilot</span>
          <span>·</span>
          <span>Supabase Cloud Connected</span>
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          <h2>
            {mode === 'login'
              ? 'Sign in to Revive'
              : mode === 'signup'
                ? 'Create your organization'
                : 'Reset your password'}
          </h2>
          <p className="auth-sub">
            {mode === 'login'
              ? 'Enter your workspace credentials or launch the interactive demo.'
              : mode === 'signup'
                ? 'Set up your subscription management workspace in seconds.'
                : 'Enter your registered email and choose a new password.'}
          </p>

          <div className="demo-access-box">
            <div>
              <strong>Instant Demo Workspace</strong>
              <span>Explore Brightloop Software with seeded records</span>
            </div>
            <button
              type="button"
              className="secondary-button compact"
              onClick={handleDemoLogin}
              disabled={loading}
            >
              <Play size={12} /> Launch Demo
            </button>
          </div>

          <div className="auth-divider">or continue with email</div>

          {error && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}
          {successMsg && (
            <div
              style={{
                marginBottom: 14,
                padding: '10px 12px',
                borderRadius: 5,
                background: 'var(--status-success-bg)',
                border: '1px solid var(--status-success-border)',
                color: 'var(--status-success)',
                fontSize: 12,
              }}
            >
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="form-stack">
            {mode === 'signup' && (
              <>
                <label>
                  Full Name
                  <input
                    required
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                  />
                </label>
                <label>
                  Organization / Business Name
                  <input
                    required
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Acme Cloud Technologies"
                  />
                </label>
                <div className="form-row">
                  <label>
                    Business Type
                    <select
                      value={businessType}
                      onChange={(e) => setBusinessType(e.target.value)}
                    >
                      <option value="B2B SaaS">B2B SaaS</option>
                      <option value="AI & Developer Tools">AI & Developer Tools</option>
                      <option value="Fintech & API">Fintech & API</option>
                      <option value="E-Commerce Subscription">E-Commerce Subscription</option>
                      <option value="Digital Media & EdTech">Digital Media & EdTech</option>
                    </select>
                  </label>
                  <label>
                    Billing Currency
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
                </div>
              </>
            )}

            <label>
              Work Email
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </label>

            <label>
              {mode === 'reset' ? 'New Password (min. 6 characters)' : 'Password'}
              <input
                required
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
              />
            </label>

            <button
              type="submit"
              className="primary-button full-button"
              disabled={loading}
              style={{ marginTop: 4 }}
            >
              {loading
                ? 'Processing...'
                : mode === 'login'
                  ? 'Sign in to workspace'
                  : mode === 'signup'
                    ? 'Create account & continue'
                    : 'Update password'}
              <ArrowRight size={14} />
            </button>
          </form>

          <div className="auth-switch">
            {mode === 'login' && (
              <>
                New to Revive?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setEmail('');
                    setPassword('');
                    setError('');
                  }}
                >
                  Create an account
                </button>
                {' · '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('reset');
                    setPassword('');
                    setError('');
                  }}
                >
                  Reset password
                </button>
              </>
            )}
            {mode === 'signup' && (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setEmail('aditya@brightloop.io');
                    setPassword('ReviveDemo#2026');
                    setError('');
                  }}
                >
                  Sign in
                </button>
              </>
            )}
            {mode === 'reset' && (
              <>
                Remembered your password?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                >
                  Back to sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
