import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  Eye,
  Layers,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiRequest } from '../api';
import { Organization } from '../../server/types';
import { formatCompactMoney, formatMoney } from '../utils/format';

interface CopilotViewProps {
  organization: Organization;
  geminiConfigured: boolean;
  geminiModel?: string;
  overviewData: any;
  customers: any[];
  onNavigate: (page: string) => void;
  notify: (msg: string) => void;
}

export function RevenueCopilotView({
  organization,
  geminiConfigured,
  geminiModel = 'gemini-3.8-flash',
  overviewData,
  customers,
  onNavigate,
  notify,
}: CopilotViewProps) {
  const currency = organization.currency || 'INR';
  const metrics = overviewData?.metrics || {};
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [allowFallback, setAllowFallback] = useState(true);
  const [configError, setConfigError] = useState('');
  const [chat, setChat] = useState<
    Array<{ role: 'user' | 'assistant'; text: string; mode?: string; model?: string }>
  >([]);

  const suggestedQuestions = [
    'What is our current MRR and ARR?',
    'Which customers are at risk of churning?',
    'Which subscription plans generate the most revenue?',
    'What would happen if we increased prices by 10%?',
    'Which customers have failed payments or overdue invoices?',
  ];

  const sendQuestion = async (questionText?: string) => {
    const q = (questionText ?? prompt).trim();
    if (!q || loading) return;

    setConfigError('');
    const nextHistory = [...chat, { role: 'user' as const, text: q }];
    setChat(nextHistory);
    setPrompt('');
    setLoading(true);

    try {
      const res = await apiRequest('/api/ai/copilot', {
        method: 'POST',
        body: JSON.stringify({
          message: q,
          history: chat.map((m) => ({ role: m.role, text: m.text })),
          allowDeterministicFallback: allowFallback,
        }),
      });
      setChat((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: res.answer,
          mode: res.mode,
          model: res.model,
        },
      ]);
    } catch (err: any) {
      if (err.status === 503 && err.data?.configured === false) {
        setConfigError(err.message);
      } else {
        setConfigError(err.message || 'AI Copilot request failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const highRiskCustomers = customers
    .filter((c) => c.status === 'at_risk' || c.status === 'past_due' || c.risk_score >= 60)
    .sort((a, b) => b.risk_score - a.risk_score);

  return (
    <div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">GOOGLE GEMINI AI REVENUE COPILOT & RISK TELEMETRY</div>
          <h1>Revenue Intelligence</h1>
          <p>
            Query your live organization metrics, identify churn risks, and generate data-backed
            action plans powered by Google Gemini.
          </p>
        </div>
        <div className="heading-actions">
          <span className={`status-pill ${geminiConfigured ? 'active' : 'overdue'}`}>
            <i />
            {geminiConfigured
              ? `Google Gemini Connected (${geminiModel})`
              : 'GEMINI_API_KEY Not Configured'}
          </span>
        </div>
      </div>

      {!geminiConfigured && (
        <div
          className="panel"
          style={{
            padding: '14px 18px',
            marginBottom: 16,
            borderColor: 'var(--status-warning-border)',
            background: 'var(--status-warning-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 12 }}>
            <strong style={{ color: 'var(--status-warning)' }}>
              Google Gemini API Key Configuration Notice:
            </strong>{' '}
            <span>
              Set <code className="mono">GEMINI_API_KEY</code> and{' '}
              <code className="mono">GEMINI_MODEL</code> in your{' '}
              <code className="mono">.env</code> file to enable live Google Gemini completions. When
              unconfigured, you can toggle the{' '}
              <strong>Deterministic Backend Analytics Engine</strong> below to answer questions
              using exact server-side SQL/ledger aggregations.
            </span>
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={allowFallback}
              onChange={(e) => setAllowFallback(e.target.checked)}
            />
            <span>Enable Deterministic Analytics Engine</span>
          </label>
        </div>
      )}

      <div className="copilot-layout">
        <section className="panel chat-container">
          <div className="panel-header">
            <div>
              <h2>Ask Revive Revenue Copilot (Google Gemini)</h2>
              <p>
                Grounded in {organization.name}'s live ledger (MRR:{' '}
                {formatMoney(metrics.mrr, currency)} · Outstanding:{' '}
                {formatMoney(metrics.outstanding_revenue, currency)})
              </p>
            </div>
            <BrainCircuit size={17} style={{ color: 'var(--accent-primary)' }} />
          </div>

          <div className="chat-messages">
            {chat.length === 0 ? (
              <div className="empty-state" style={{ margin: 'auto' }}>
                <Sparkles size={24} style={{ color: 'var(--accent-primary)' }} />
                <strong>Ask a question about your subscription business</strong>
                <p>
                  Select one of the prompts below or type a custom question about MRR, churn risk,
                  plan performance, or pricing scenarios.
                </p>
              </div>
            ) : (
              chat.map((msg, idx) => (
                <div key={idx} className={`chat-bubble ${msg.role}`}>
                  <div className="profile-avatar">
                    {msg.role === 'assistant' ? <Sparkles size={13} /> : 'YO'}
                  </div>
                  <div className="chat-bubble-body">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <strong style={{ fontSize: 11.5 }}>
                        {msg.role === 'assistant' ? 'Revive Gemini Copilot' : 'You'}
                      </strong>
                      {msg.mode && (
                        <span
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {msg.mode === 'gemini_live'
                            ? `Google Gemini API (${msg.model || geminiModel})`
                            : 'Deterministic Analytics Engine'}
                        </span>
                      )}
                    </div>
                    <div>{msg.text}</div>
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="chat-bubble assistant">
                <div className="profile-avatar">
                  <Sparkles size={13} />
                </div>
                <div className="chat-bubble-body">
                  Computing ledger metrics and generating response...
                </div>
              </div>
            )}
            {configError && <div className="form-error">{configError}</div>}
          </div>

          <div className="prompt-chips">
            {suggestedQuestions.map((q) => (
              <button key={q} type="button" onClick={() => sendQuestion(q)} disabled={loading}>
                {q}
              </button>
            ))}
          </div>

          <form
            className="chat-input-bar"
            onSubmit={(e) => {
              e.preventDefault();
              sendQuestion();
            }}
          >
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask about MRR, churn risk, failed payments, or pricing..."
            />
            <button type="submit" className="primary-button" disabled={loading || !prompt.trim()}>
              <Send size={14} /> Ask
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Accounts Requiring Intervention</h2>
              <p>Ranked by real-time payment & renewal risk score</p>
            </div>
            <button
              type="button"
              className="mini-action"
              onClick={() => onNavigate('Customers')}
            >
              All Customers <ArrowRight size={12} />
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Risk Score</th>
                  <th>MRR Exposed</th>
                  <th>Signal</th>
                </tr>
              </thead>
              <tbody>
                {highRiskCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: 24 }}>
                      No high-risk accounts detected.
                    </td>
                  </tr>
                ) : (
                  highRiskCustomers.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.name}</strong>
                        <small>{c.external_code}</small>
                      </td>
                      <td>
                        <div className="risk-wrap">
                          <div className="risk-track">
                            <i style={{ width: `${c.risk_score}%` }} className="high" />
                          </div>
                          <span className="mono">{c.risk_score}</span>
                        </div>
                      </td>
                      <td className="amount-cell">{formatMoney(c.mrr, currency)}</td>
                      <td>
                        <small style={{ whiteSpace: 'normal', maxWidth: 180 }}>
                          {c.risk_reason}
                        </small>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

interface SimulatorViewProps {
  organization: Organization;
  overviewData: any;
  notify: (msg: string) => void;
}

export function BusinessSimulatorView({
  organization,
  overviewData,
  notify,
}: SimulatorViewProps) {
  const currency = organization.currency || 'INR';
  const metrics = overviewData?.metrics || {
    mrr: 165300,
    active_subscriptions_count: 9,
    arpu: 18366,
    churn_rate: 3.5,
  };

  const [inputs, setInputs] = useState({
    price_change_percent: 0,
    monthly_churn_percent: Number(metrics.churn_rate) || 4,
    new_customers_per_month: 4,
    conversion_rate_percent: 25,
    payment_failure_percent: 4,
    recovery_rate_percent: 60,
    discount_percent: 0,
  });

  const [simData, setSimData] = useState<any | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<any[]>([]);

  const fetchSimulation = async () => {
    try {
      const res = await apiRequest('/api/simulator/calculate', {
        method: 'POST',
        body: JSON.stringify(inputs),
      });
      setSimData(res);
    } catch (err: any) {
      notify(err.message || 'Simulation calculation failed');
    }
  };

  useEffect(() => {
    fetchSimulation();
  }, [
    organization.id,
    inputs.price_change_percent,
    inputs.monthly_churn_percent,
    inputs.new_customers_per_month,
    inputs.conversion_rate_percent,
    inputs.payment_failure_percent,
    inputs.recovery_rate_percent,
    inputs.discount_percent,
  ]);

  const sim = simData?.simulation;
  const baseline = simData?.actualBaseline || {
    mrr: metrics.mrr,
    arr: metrics.mrr * 12,
    active_subscriptions: metrics.active_subscriptions_count,
    arpu: metrics.arpu,
  };

  const sliders: Array<{
    key: keyof typeof inputs;
    label: string;
    min: number;
    max: number;
    unit: string;
  }> = [
    { key: 'price_change_percent', label: 'Subscription Price Change', min: -15, max: 30, unit: '%' },
    { key: 'monthly_churn_percent', label: 'Monthly Churn Rate', min: 0, max: 15, unit: '%' },
    { key: 'new_customers_per_month', label: 'New Trials / Leads per Month', min: 0, max: 50, unit: '' },
    { key: 'conversion_rate_percent', label: 'Trial-to-Paid Conversion Rate', min: 5, max: 80, unit: '%' },
    { key: 'payment_failure_percent', label: 'Payment Failure Rate', min: 0, max: 15, unit: '%' },
    { key: 'recovery_rate_percent', label: 'Dunning Recovery Rate', min: 0, max: 100, unit: '%' },
    { key: 'discount_percent', label: 'Promotional Discount', min: 0, max: 30, unit: '%' },
  ];

  return (
    <div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DETERMINISTIC SCENARIO MODELING</div>
          <h1>Business Simulator & Revenue Forecasting</h1>
          <p>
            Model the 12-month impact of pricing changes, churn reduction, and dunning recovery
            against your actual baseline ledger.
          </p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setInputs({
                price_change_percent: 0,
                monthly_churn_percent: Number(metrics.churn_rate) || 4,
                new_customers_per_month: 4,
                conversion_rate_percent: 25,
                payment_failure_percent: 4,
                recovery_rate_percent: 60,
                discount_percent: 0,
              });
              notify('Simulation parameters reset to current baseline');
            }}
          >
            <RotateCcw size={14} /> Reset to Baseline
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              if (!sim) return;
              setSavedScenarios((prev) => [
                {
                  name: `Scenario #${prev.length + 1}`,
                  inputs: { ...inputs },
                  mrr12: sim.month_12_projected_mrr,
                  arr12: sim.month_12_projected_arr,
                  growth: sim.growth_percent_12m,
                },
                ...prev,
              ]);
              notify('Scenario saved for comparison');
            }}
          >
            <Plus size={14} /> Save Scenario
          </button>
        </div>
      </div>

      <div className="sim-layout">
        <section className="panel" style={{ padding: 18 }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, margin: 0 }}>Adjust Growth & Pricing Levers</h2>
            <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Baseline MRR: {formatMoney(baseline.mrr, currency)} · Active Subs:{' '}
              {baseline.active_subscriptions}
            </p>
          </div>

          {sliders.map((s) => (
            <div className="slider-control" key={s.key}>
              <div className="slider-label">
                <span>{s.label}</span>
                <strong>
                  {inputs[s.key] > 0 && s.key === 'price_change_percent' ? '+' : ''}
                  {inputs[s.key]}
                  {s.unit}
                </strong>
              </div>
              <input
                type="range"
                min={s.min}
                max={s.max}
                value={inputs[s.key]}
                onChange={(e) =>
                  setInputs({ ...inputs, [s.key]: Number(e.target.value) })
                }
              />
            </div>
          ))}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sim && (
            <>
              <div className="metrics-grid" style={{ marginBottom: 0 }}>
                <div className="metric-card">
                  <div className="metric-top">
                    <span>Month 12 Projected MRR</span>
                  </div>
                  <div className="metric-value">
                    {formatCompactMoney(sim.month_12_projected_mrr, currency)}
                  </div>
                  <div className="metric-foot">
                    <span
                      className={`metric-change ${
                        sim.growth_percent_12m >= 0 ? 'green' : 'red'
                      }`}
                    >
                      {sim.growth_percent_12m >= 0 ? '+' : ''}
                      {sim.growth_percent_12m}% vs current
                    </span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <span>Projected Annual Run-Rate</span>
                  </div>
                  <div className="metric-value">
                    {formatCompactMoney(sim.month_12_projected_arr, currency)}
                  </div>
                  <div className="metric-foot">
                    <span>{sim.projected_subscribers_12m} projected subscribers</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <span>Monthly Dunning Recovery</span>
                  </div>
                  <div className="metric-value">
                    {formatMoney(sim.monthly_recovered_revenue, currency)}
                  </div>
                  <div className="metric-foot">
                    <span>Unrecovered loss: {sim.unrecovered_loss_percent}%</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-top">
                    <span>Effective Scenario ARPU</span>
                  </div>
                  <div className="metric-value">
                    {formatMoney(sim.effective_arpu, currency)}
                  </div>
                  <div className="metric-foot">
                    <span>Expansion: +{formatMoney(sim.monthly_expansion_revenue, currency)}/mo</span>
                  </div>
                </div>
              </div>

              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>12-Month Trajectory: Projected Scenario vs. Current Baseline</h2>
                    <p>
                      Clearly separates simulated scenario projection from baseline run-rate
                    </p>
                  </div>
                  <span className="status-pill pending">
                    <i />
                    SIMULATED PROJECTION
                  </span>
                </div>
                <div style={{ height: 260, padding: '16px 16px 4px 4px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sim.timeline}>
                      <defs>
                        <linearGradient id="simGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="var(--border-subtle)"
                      />
                      <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                        tickFormatter={(v) => formatCompactMoney(v, currency)}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--bg-surface-elevated)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                        formatter={(v: any, name: string) => [
                          formatMoney(Number(v), currency),
                          name === 'projected_mrr'
                            ? 'Scenario Projected MRR'
                            : 'Baseline Trajectory',
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="projected_mrr"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="url(#simGrad)"
                      />
                      <Line
                        type="monotone"
                        dataKey="baseline_mrr"
                        stroke="#10b981"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </>
          )}

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Saved Scenario Comparisons ({savedScenarios.length})</h2>
                <p>Compare different pricing and retention strategies side-by-side</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Price Δ</th>
                    <th>Churn %</th>
                    <th>Recovery %</th>
                    <th>Month 12 MRR</th>
                    <th>Month 12 ARR</th>
                    <th>12m Growth</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {savedScenarios.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: 20 }}>
                        Adjust the sliders and click "Save Scenario" to compare strategies.
                      </td>
                    </tr>
                  ) : (
                    savedScenarios.map((s, idx) => (
                      <tr key={idx}>
                        <td>
                          <strong>{s.name}</strong>
                        </td>
                        <td>{s.inputs.price_change_percent}%</td>
                        <td>{s.inputs.monthly_churn_percent}%</td>
                        <td>{s.inputs.recovery_rate_percent}%</td>
                        <td className="amount-cell">{formatMoney(s.mrr12, currency)}</td>
                        <td className="amount-cell">{formatMoney(s.arr12, currency)}</td>
                        <td>
                          <span
                            className={`status-pill ${s.growth >= 0 ? 'active' : 'failed'}`}
                          >
                            {s.growth >= 0 ? '+' : ''}
                            {s.growth}%
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="mini-action"
                            onClick={() => setInputs(s.inputs)}
                          >
                            <Eye size={12} /> Load
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
