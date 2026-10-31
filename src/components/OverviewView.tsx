import React from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BrainCircuit,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Layers,
  Plus,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Invoice, NotificationItem, Organization } from '../../server/types';
import {
  formatCompactMoney,
  formatDate,
  formatMoney,
  formatStatusLabel,
} from '../utils/format';

interface OverviewProps {
  organization: Organization;
  overviewData: any;
  invoices: Array<Invoice & { customer_name?: string }>;
  range: string;
  setRange: (r: string) => void;
  customFrom: string;
  setCustomFrom: (d: string) => void;
  customTo: string;
  setCustomTo: (d: string) => void;
  onNavigate: (page: string) => void;
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
  onOpenNewCustomer: () => void;
  onOpenNewSubscription: () => void;
}

export function OverviewView({
  organization,
  overviewData,
  invoices,
  range,
  setRange,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  onNavigate,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onOpenNewCustomer,
  onOpenNewSubscription,
}: OverviewProps) {
  const currency = organization.currency || 'INR';
  const metrics = overviewData?.metrics || {
    mrr: 0,
    active_mrr: 0,
    past_due_mrr: 0,
    arr: 0,
    mrr_at_risk: 0,
    total_invoiced: 0,
    collected_revenue: 0,
    outstanding_revenue: 0,
    overdue_revenue: 0,
    failed_payment_amount: 0,
    failed_payments_count: 0,
    unpaid_invoices_count: 0,
    active_subscriptions_count: 0,
    new_subscriptions_count: 0,
    total_customers_count: 0,
    at_risk_customers_count: 0,
    churn_rate: 0,
    collection_rate: 100,
    arpu: 0,
    plan_performance: [],
  };

  const revenueSeries = overviewData?.revenueSeries || [];
  const notifications: NotificationItem[] = overviewData?.notifications || [];
  const unreadNotifications = notifications.filter((n) => !n.is_read);
  const isEmptyOrg =
    metrics.total_customers_count === 0 && metrics.active_subscriptions_count === 0;

  return (
    <div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {organization.name.toUpperCase()} · REVENUE COMMAND CENTER
          </div>
          <h1>Analytics & Revenue Overview</h1>
          <p>
            Real-time recurring revenue, collection performance, and risk telemetry computed from
            your ledger.
          </p>
        </div>

        <div className="heading-actions" style={{ flexWrap: 'wrap' }}>
          <select
            className="small-select"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            aria-label="Date range filter"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="12m">Last 12 months</option>
            <option value="custom">Custom range</option>
          </select>

          {range === 'custom' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="date"
                className="small-select"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span style={{ color: 'var(--text-muted)' }}>to</span>
              <input
                type="date"
                className="small-select"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={() => onNavigate('Business simulator')}
          >
            <Activity size={14} /> Run Forecast
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => onNavigate('Revenue intelligence')}
          >
            <Sparkles size={14} /> AI Revenue Copilot
          </button>
        </div>
      </div>

      {isEmptyOrg && (
        <div
          className="panel"
          style={{
            padding: 28,
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div className="eyebrow">GETTING STARTED</div>
            <h2 style={{ fontSize: 18, margin: '4px 0 6px' }}>
              Your organization ledger is ready
            </h2>
            <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: 620 }}>
              Start by adding your first customer and assigning them to a recurring subscription
              plan, or load sample data from Settings to explore analytics immediately.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="secondary-button" onClick={onOpenNewCustomer}>
              <Plus size={14} /> Add First Customer
            </button>
            <button type="button" className="primary-button" onClick={onOpenNewSubscription}>
              <Plus size={14} /> Create Subscription
            </button>
          </div>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span>Monthly Recurring Revenue (MRR)</span>
            <div className="metric-icon blue">
              <CircleDollarSign size={15} />
            </div>
          </div>
          <div className="metric-value">{formatCompactMoney(metrics.mrr, currency)}</div>
          <div className="metric-foot">
            <span className="metric-change green">
              <ArrowUpRight size={13} /> ARR {formatCompactMoney(metrics.arr, currency)}
            </span>
            <span>· {formatMoney(metrics.active_mrr, currency)} active</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>Active Subscriptions</span>
            <div className="metric-icon green">
              <RefreshCw size={15} />
            </div>
          </div>
          <div className="metric-value">{metrics.active_subscriptions_count}</div>
          <div className="metric-foot">
            <span className="metric-change green">+{metrics.new_subscriptions_count} new</span>
            <span>· ARPU {formatMoney(metrics.arpu, currency)}/mo</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>Collected vs. Outstanding</span>
            <div className="metric-icon amber">
              <Wallet size={15} />
            </div>
          </div>
          <div className="metric-value">
            {formatCompactMoney(metrics.collected_revenue, currency)}
          </div>
          <div className="metric-foot">
            <span className="metric-change amber">
              {formatMoney(metrics.outstanding_revenue, currency)} unpaid
            </span>
            <span>· {metrics.collection_rate}% collected</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>MRR at Risk & Churn</span>
            <div className="metric-icon red">
              <ShieldCheck size={15} />
            </div>
          </div>
          <div className="metric-value">{formatCompactMoney(metrics.mrr_at_risk, currency)}</div>
          <div className="metric-foot">
            <span className="metric-change red">
              {metrics.at_risk_customers_count} at-risk accounts
            </span>
            <span>· {metrics.churn_rate}% churn rate</span>
          </div>
        </div>
      </div>

      {/* Main Charts & Actionable Notifications */}
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Recurring Revenue & Forward Projection</h2>
              <p>
                Historical MRR & cash collections vs. deterministic 3-month forward trajectory
              </p>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-secondary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <i
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#3b82f6',
                    display: 'inline-block',
                  }}
                />
                Actual MRR
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <i
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#10b981',
                    display: 'inline-block',
                  }}
                />
                Projected Run-Rate
              </span>
            </div>
          </div>

          <div style={{ height: 270, padding: '16px 16px 4px 4px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={revenueSeries}>
                <defs>
                  <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
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
                  formatter={(val: any, name: string) => [
                    formatMoney(Number(val), currency),
                    name === 'mrr'
                      ? 'Actual MRR'
                      : name === 'forecast'
                        ? 'Projected Run-Rate'
                        : 'Collected Cash',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="mrr"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#mrrFill)"
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 18px',
              borderTop: '1px solid var(--border-subtle)',
              fontSize: 11.5,
              color: 'var(--text-secondary)',
            }}
          >
            <span>
              Total Invoiced: <strong>{formatMoney(metrics.total_invoiced, currency)}</strong> ·
              Overdue: <strong style={{ color: 'var(--status-danger)' }}>{formatMoney(metrics.overdue_revenue, currency)}</strong>
            </span>
            <button
              type="button"
              className="mini-action"
              onClick={() => onNavigate('Business simulator')}
            >
              Open Scenario Simulator <ArrowRight size={12} />
            </button>
          </div>
        </section>

        <section className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header">
            <div>
              <h2>
                Operational Alerts{' '}
                {unreadNotifications.length > 0 && (
                  <span className="nav-badge" style={{ marginLeft: 6 }}>
                    {unreadNotifications.length} unread
                  </span>
                )}
              </h2>
              <p>Automated dunning, renewal, and payment events</p>
            </div>
            {unreadNotifications.length > 0 && (
              <button
                type="button"
                className="mini-action"
                onClick={onMarkAllNotificationsRead}
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 285, padding: '6px 16px' }}>
            {notifications.length === 0 ? (
              <div className="empty-state" style={{ padding: '28px 10px' }}>
                <CheckCircle2 size={22} style={{ color: 'var(--status-success)' }} />
                <strong>All caught up</strong>
                <p>No active payment failures or overdue renewal alerts.</p>
              </div>
            ) : (
              notifications.slice(0, 6).map((n) => (
                <div
                  key={n.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border-subtle)',
                    opacity: n.is_read ? 0.65 : 1,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        className={`status-pill ${
                          n.severity === 'critical'
                            ? 'failed'
                            : n.severity === 'warning'
                              ? 'overdue'
                              : n.severity === 'success'
                                ? 'paid'
                                : 'pending'
                        }`}
                        style={{ padding: '1px 6px', fontSize: 10 }}
                      >
                        {n.type.replace('_', ' ')}
                      </span>
                      <strong style={{ fontSize: 12 }}>{n.title}</strong>
                    </div>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: 11.5,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {n.message}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {n.entity_type === 'invoice' && (
                      <button
                        type="button"
                        className="mini-action"
                        onClick={() => onNavigate('Invoices')}
                      >
                        Resolve
                      </button>
                    )}
                    {!n.is_read && (
                      <button
                        type="button"
                        className="mini-action"
                        onClick={() => onMarkNotificationRead(n.id)}
                        title="Mark as read"
                      >
                        ✓
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Bottom Grid: Recent Invoices & Plan Performance */}
      <div className="bottom-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Recent Billing & Invoices</h2>
              <p>Latest invoices generated across your customer base</p>
            </div>
            <button
              type="button"
              className="mini-action"
              onClick={() => onNavigate('Invoices')}
            >
              View all invoices <ArrowRight size={12} />
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Issued</th>
                  <th>Due Date</th>
                  <th>Total (incl. Tax)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>
                      No invoices generated yet.
                    </td>
                  </tr>
                ) : (
                  invoices.slice(0, 5).map((inv) => (
                    <tr
                      key={inv.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onNavigate('Invoices')}
                    >
                      <td className="mono">{inv.invoice_number}</td>
                      <td>
                        <strong>{inv.customer_name || 'Customer'}</strong>
                      </td>
                      <td>{formatDate(inv.issue_date)}</td>
                      <td>{formatDate(inv.due_date)}</td>
                      <td className="amount-cell">
                        {formatMoney(inv.total_amount, inv.currency)}
                      </td>
                      <td>
                        <span className={`status-pill ${inv.status}`}>
                          <i />
                          {formatStatusLabel(inv.status)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Plan Revenue Distribution</h2>
              <p>MRR contribution by active subscription tier</p>
            </div>
            <button
              type="button"
              className="mini-action"
              onClick={() => onNavigate('Plans & products')}
            >
              Manage plans
            </button>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(metrics.plan_performance || []).length === 0 ? (
              <div className="empty-state" style={{ padding: 20 }}>
                <p>No active plans configured.</p>
              </div>
            ) : (
              metrics.plan_performance.map((p: any) => (
                <div key={p.plan_id}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      marginBottom: 5,
                    }}
                  >
                    <span>
                      <strong>{p.name}</strong>{' '}
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        ({p.active_subscriptions} subs)
                      </span>
                    </span>
                    <span className="mono">
                      {formatMoney(p.mrr, currency)}/mo ({p.share_percent}%)
                    </span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      background: 'var(--bg-subtle)',
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, Math.max(4, p.share_percent))}%`,
                        background: 'var(--accent-primary)',
                        borderRadius: 4,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
