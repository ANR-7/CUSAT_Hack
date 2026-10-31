import React, { useState } from 'react';
import {
  Archive,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Edit3,
  Layers,
  PauseCircle,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { apiRequest } from '../api';
import { BillingInterval, Customer, Organization, Plan, Subscription } from '../../server/types';
import { formatDate, formatMoney, formatStatusLabel } from '../utils/format';

interface SubscriptionsViewProps {
  organization: Organization;
  subscriptions: any[];
  customers: any[];
  plans: any[];
  openCreateInitially?: boolean;
  onClearOpenCreate?: () => void;
  onDataMutated: () => void;
  notify: (msg: string) => void;
}

export function SubscriptionsView({
  organization,
  subscriptions,
  customers,
  plans,
  openCreateInitially,
  onClearOpenCreate,
  onDataMutated,
  notify,
}: SubscriptionsViewProps) {
  const currency = organization.currency || 'INR';
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(Boolean(openCreateInitially));
  const [editingSub, setEditingSub] = useState<any | null>(null);
  const [cancellingSub, setCancellingSub] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('Budget constraints / downsizing');
  const [formError, setFormError] = useState('');

  const activePlans = plans.filter((p) => p.status === 'active');
  const [newSub, setNewSub] = useState({
    customer_id: customers[0]?.id || '',
    plan_id: activePlans[0]?.id || '',
    quantity: 1,
    discount_percent: 0,
    start_trial: false,
    generate_invoice: true,
  });

  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      await apiRequest('/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: newSub.customer_id || customers[0]?.id,
          plan_id: newSub.plan_id || activePlans[0]?.id,
          quantity: Number(newSub.quantity) || 1,
          discount_percent: Number(newSub.discount_percent) || 0,
          start_trial: newSub.start_trial,
          generate_invoice: newSub.generate_invoice,
        }),
      });
      setShowCreateModal(false);
      onClearOpenCreate?.();
      notify('Subscription created and ledger updated');
      onDataMutated();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create subscription');
    }
  };

  const handleLifecycleAction = async (
    subId: string,
    action: 'pause' | 'resume' | 'cancel' | 'renew' | 'change_plan',
    extra: Record<string, any> = {}
  ) => {
    try {
      const res = await apiRequest(`/api/subscriptions/${subId}/lifecycle`, {
        method: 'POST',
        body: JSON.stringify({ action, ...extra }),
      });
      notify(
        action === 'renew' && res.invoice
          ? `Subscription renewed & invoice ${res.invoice.invoice_number} generated`
          : `Subscription ${action}d`
      );
      setCancellingSub(null);
      setEditingSub(null);
      onDataMutated();
    } catch (err: any) {
      notify(err.message || `Failed to ${action} subscription`);
    }
  };

  const filteredSubs = subscriptions.filter((s) => {
    if (filter !== 'all' && s.status !== filter) return false;
    if (!search.trim()) return true;
    return [s.code, s.customer_name, s.plan_name, s.status, s.billing_interval]
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase());
  });

  const activeCount = subscriptions.filter((s) => s.status === 'active').length;
  const trialingCount = subscriptions.filter((s) => s.status === 'trialing').length;
  const pastDueCount = subscriptions.filter((s) => s.status === 'past_due').length;
  const pausedCount = subscriptions.filter((s) => s.status === 'paused').length;
  const cancelledCount = subscriptions.filter((s) => s.status === 'cancelled').length;

  const totalActiveMrr = subscriptions
    .filter((s) => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due')
    .reduce((sum, s) => sum + Number(s.mrr_amount || 0), 0);

  return (
    <div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SUBSCRIPTION LIFECYCLE ENGINE</div>
          <h1>Subscriptions</h1>
          <p>
            Manage recurring contracts, plan upgrades, trial conversions, pauses, and renewals.
          </p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setFormError('');
              setNewSub({
                customer_id: customers[0]?.id || '',
                plan_id: activePlans[0]?.id || '',
                quantity: 1,
                discount_percent: 0,
                start_trial: false,
                generate_invoice: true,
              });
              setShowCreateModal(true);
            }}
          >
            <Plus size={14} /> New Subscription
          </button>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span>Total Recurring MRR</span>
            <div className="metric-icon blue">
              <CircleDollarSign size={15} />
            </div>
          </div>
          <div className="metric-value">{formatMoney(totalActiveMrr, currency)}</div>
          <div className="metric-foot">
            <span>ARR {formatMoney(totalActiveMrr * 12, currency)}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>Active & Trialing</span>
            <div className="metric-icon green">
              <RefreshCw size={15} />
            </div>
          </div>
          <div className="metric-value">{activeCount + trialingCount}</div>
          <div className="metric-foot">
            <span>
              {activeCount} active · {trialingCount} trialing
            </span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>Past Due / At Risk</span>
            <div className="metric-icon red">
              <PauseCircle size={15} />
            </div>
          </div>
          <div className="metric-value">{pastDueCount}</div>
          <div className="metric-foot">
            <span>Awaiting payment recovery</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>Paused & Cancelled</span>
            <div className="metric-icon amber">
              <XCircle size={15} />
            </div>
          </div>
          <div className="metric-value">{pausedCount + cancelledCount}</div>
          <div className="metric-foot">
            <span>
              {pausedCount} paused · {cancelledCount} cancelled
            </span>
          </div>
        </div>
      </div>

      <section className="panel">
        <div className="table-toolbar">
          <div className="toolbar-left">
            <div className="search-field">
              <Search size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subscription code, customer, plan..."
              />
            </div>

            <div className="filter-tabs">
              {[
                ['all', 'All'],
                ['active', 'Active'],
                ['trialing', 'Trialing'],
                ['past_due', 'Past Due'],
                ['paused', 'Paused'],
                ['cancelled', 'Cancelled'],
              ].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  className={filter === val ? 'selected' : ''}
                  onClick={() => setFilter(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Subscription</th>
                <th>Customer</th>
                <th>Plan & Cadence</th>
                <th>Qty / Discount</th>
                <th>Normalized MRR</th>
                <th>Next Billing</th>
                <th>Status</th>
                <th>Lifecycle Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubs.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <RefreshCw size={22} />
                      <strong>No subscriptions found</strong>
                      <p>Create a new subscription to start tracking recurring revenue.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSubs.map((s) => (
                  <tr key={s.id}>
                    <td className="mono">{s.code}</td>
                    <td>
                      <strong>{s.customer_name}</strong>
                      <small>{s.customer_email}</small>
                    </td>
                    <td>
                      <strong>{s.plan_name}</strong>
                      <small>
                        {formatMoney(s.unit_price, s.currency)} / {s.billing_interval}
                      </small>
                    </td>
                    <td>
                      {s.quantity} seat{s.quantity > 1 ? 's' : ''}
                      {s.discount_percent > 0 && (
                        <small style={{ color: 'var(--status-success)' }}>
                          {s.discount_percent}% discount
                        </small>
                      )}
                    </td>
                    <td className="amount-cell">{formatMoney(s.mrr_amount, s.currency)}/mo</td>
                    <td>
                      {s.status === 'cancelled'
                        ? 'Cancelled'
                        : s.status === 'paused'
                          ? 'Paused'
                          : formatDate(s.next_billing_date)}
                      {s.trial_ends_at && s.status === 'trialing' && (
                        <small>Trial ends {formatDate(s.trial_ends_at)}</small>
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${s.status}`}>
                        <i />
                        {formatStatusLabel(s.status)}
                      </span>
                      {s.cancellation_reason && (
                        <small title={s.cancellation_reason}>{s.cancellation_reason}</small>
                      )}
                    </td>
                    <td>
                      <div className="action-pair">
                        {s.status !== 'cancelled' && (
                          <button
                            type="button"
                            className="mini-action"
                            onClick={() => setEditingSub({ ...s })}
                            title="Change plan, seats or discount"
                          >
                            <Edit3 size={12} /> Plan
                          </button>
                        )}
                        {(s.status === 'active' ||
                          s.status === 'past_due' ||
                          s.status === 'trialing') && (
                          <button
                            type="button"
                            className="mini-action"
                            onClick={() => handleLifecycleAction(s.id, 'renew')}
                            title="Renew billing cycle & generate invoice"
                          >
                            <RotateCcw size={12} /> Renew
                          </button>
                        )}
                        {s.status === 'active' && (
                          <button
                            type="button"
                            className="mini-action"
                            onClick={() => handleLifecycleAction(s.id, 'pause')}
                            title="Pause subscription"
                          >
                            <PauseCircle size={12} /> Pause
                          </button>
                        )}
                        {(s.status === 'paused' || s.status === 'cancelled') && (
                          <button
                            type="button"
                            className="mini-action success"
                            onClick={() => handleLifecycleAction(s.id, 'resume')}
                            title="Resume subscription"
                          >
                            <Play size={12} /> Resume
                          </button>
                        )}
                        {s.status !== 'cancelled' && (
                          <button
                            type="button"
                            className="mini-action danger"
                            onClick={() => {
                              setCancelReason('Customer requested cancellation');
                              setCancellingSub(s);
                            }}
                            title="Cancel subscription"
                          >
                            <XCircle size={12} /> Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Create Subscription Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2>Create New Subscription</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setShowCreateModal(false);
                  onClearOpenCreate?.();
                }}
              >
                <X size={16} />
              </button>
            </div>
            {formError && <div className="form-error" style={{ marginBottom: 12 }}>{formError}</div>}
            <form onSubmit={handleCreateSubscription} className="form-stack">
              <label>
                Customer *
                <select
                  required
                  value={newSub.customer_id}
                  onChange={(e) => setNewSub({ ...newSub, customer_id: e.target.value })}
                >
                  <option value="">Select customer...</option>
                  {customers
                    .filter((c) => c.status !== 'archived')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.email})
                      </option>
                    ))}
                </select>
              </label>

              <label>
                Subscription Plan *
                <select
                  required
                  value={newSub.plan_id}
                  onChange={(e) => setNewSub({ ...newSub, plan_id: e.target.value })}
                >
                  <option value="">Select plan...</option>
                  {activePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatMoney(p.price, p.currency)} / {p.billing_interval}
                    </option>
                  ))}
                </select>
              </label>

              <div className="form-row">
                <label>
                  Seats / Quantity
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={newSub.quantity}
                    onChange={(e) =>
                      setNewSub({ ...newSub, quantity: Number(e.target.value) || 1 })
                    }
                  />
                </label>
                <label>
                  Discount (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newSub.discount_percent}
                    onChange={(e) =>
                      setNewSub({ ...newSub, discount_percent: Number(e.target.value) || 0 })
                    }
                  />
                </label>
              </div>

              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  style={{ width: 15, height: 15 }}
                  checked={newSub.start_trial}
                  onChange={(e) => setNewSub({ ...newSub, start_trial: e.target.checked })}
                />
                <span>Start with plan trial period before billing</span>
              </label>

              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  style={{ width: 15, height: 15 }}
                  checked={newSub.generate_invoice}
                  disabled={newSub.start_trial}
                  onChange={(e) =>
                    setNewSub({ ...newSub, generate_invoice: e.target.checked })
                  }
                />
                <span>Automatically generate initial tax invoice now</span>
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setShowCreateModal(false);
                    onClearOpenCreate?.();
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  <Plus size={14} /> Create Subscription
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Plan / Edit Subscription Modal */}
      {editingSub && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2>Modify Subscription — {editingSub.code}</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setEditingSub(null)}
              >
                <X size={16} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLifecycleAction(editingSub.id, 'change_plan', {
                  plan_id: editingSub.plan_id,
                  quantity: editingSub.quantity,
                  discount_percent: editingSub.discount_percent,
                });
              }}
              className="form-stack"
            >
              <label>
                Target Plan
                <select
                  value={editingSub.plan_id}
                  onChange={(e) =>
                    setEditingSub({ ...editingSub, plan_id: e.target.value })
                  }
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatMoney(p.price, p.currency)} / {p.billing_interval})
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label>
                  Seats / Quantity
                  <input
                    type="number"
                    min="1"
                    value={editingSub.quantity}
                    onChange={(e) =>
                      setEditingSub({
                        ...editingSub,
                        quantity: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </label>
                <label>
                  Discount (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editingSub.discount_percent}
                    onChange={(e) =>
                      setEditingSub({
                        ...editingSub,
                        discount_percent: Number(e.target.value) || 0,
                      })
                    }
                  />
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditingSub(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Update Subscription & Recalculate MRR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancellingSub && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2>Cancel Subscription — {cancellingSub.code}</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setCancellingSub(null)}
              >
                <X size={16} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLifecycleAction(cancellingSub.id, 'cancel', { reason: cancelReason });
              }}
              className="form-stack"
            >
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12.5 }}>
                Cancelling <strong>{cancellingSub.customer_name}</strong>'s subscription will
                remove <strong>{formatMoney(cancellingSub.mrr_amount, currency)}/mo</strong> from
                active MRR and record the churn reason for analytics.
              </p>
              <label>
                Cancellation Reason *
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                >
                  <option value="Budget constraints / downsizing">
                    Budget constraints / downsizing
                  </option>
                  <option value="Switched to another vendor">Switched to another vendor</option>
                  <option value="Missing product features">Missing product features</option>
                  <option value="Project completed / seasonal pause">
                    Project completed / seasonal pause
                  </option>
                  <option value="Non-payment / failed dunning">
                    Non-payment / failed dunning
                  </option>
                </select>
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCancellingSub(null)}
                >
                  Keep Active
                </button>
                <button type="submit" className="danger-button">
                  Confirm Cancellation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface PlansViewProps {
  organization: Organization;
  plans: any[];
  onDataMutated: () => void;
  notify: (msg: string) => void;
}

export function PlansView({ organization, plans, onDataMutated, notify }: PlansViewProps) {
  const currency = organization.currency || 'INR';
  const [showCreate, setShowCreate] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<any | null>(null);
  const [migrateToPlanId, setMigrateToPlanId] = useState('');
  const [formError, setFormError] = useState('');

  const [newPlan, setNewPlan] = useState({
    name: '',
    description: '',
    price: '4900',
    billing_interval: 'monthly' as BillingInterval,
    trial_days: '14',
    featuresText: 'Automated GST invoicing\nReal-time analytics\nPriority email support',
  });

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      await apiRequest('/api/plans', {
        method: 'POST',
        body: JSON.stringify({
          name: newPlan.name,
          description: newPlan.description,
          price: Number(newPlan.price) || 0,
          billing_interval: newPlan.billing_interval,
          trial_days: Number(newPlan.trial_days) || 0,
          features: newPlan.featuresText
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          status: 'active',
        }),
      });
      setShowCreate(false);
      setNewPlan({
        name: '',
        description: '',
        price: '4900',
        billing_interval: 'monthly',
        trial_days: '14',
        featuresText: 'Automated GST invoicing\nReal-time analytics\nPriority email support',
      });
      notify('Subscription plan created');
      onDataMutated();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create plan');
    }
  };

  const handleEditPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    setFormError('');
    try {
      await apiRequest(`/api/plans/${editingPlan.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editingPlan.name,
          description: editingPlan.description,
          price: Number(editingPlan.price) || 0,
          billing_interval: editingPlan.billing_interval,
          trial_days: Number(editingPlan.trial_days) || 0,
          features: editingPlan.featuresText
            .split('\n')
            .map((s: string) => s.trim())
            .filter(Boolean),
          status: editingPlan.status,
        }),
      });
      setEditingPlan(null);
      notify('Plan updated');
      onDataMutated();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update plan');
    }
  };

  const handleDeletePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingPlan) return;
    setFormError('');
    try {
      const q = migrateToPlanId ? `?migrate_to_plan_id=${encodeURIComponent(migrateToPlanId)}` : '';
      const res = await apiRequest(`/api/plans/${deletingPlan.id}${q}`, {
        method: 'DELETE',
      });
      setDeletingPlan(null);
      setMigrateToPlanId('');
      notify(res.message || 'Plan removed');
      onDataMutated();
    } catch (err: any) {
      setFormError(err.message || 'Cannot delete active plan without migration');
    }
  };

  return (
    <div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PRODUCT CATALOG & PRICING TIERS</div>
          <h1>Plans & Products</h1>
          <p>
            Configure recurring pricing tiers, billing intervals, trial periods, and entitlements.
          </p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setFormError('');
              setShowCreate(true);
            }}
          >
            <Plus size={14} /> Create Plan
          </button>
        </div>
      </div>

      <div className="plan-grid">
        {plans.map((p) => (
          <div className="plan-card" key={p.id}>
            <div>
              <div className="plan-card-top">
                <span className="mono">{p.code}</span>
                <span className={`status-pill ${p.status === 'active' ? 'active' : 'paused'}`}>
                  <i />
                  {formatStatusLabel(p.status)}
                </span>
              </div>
              <h3>{p.name}</h3>
              <p className="plan-desc">{p.description || 'Recurring subscription plan'}</p>
              <div className="plan-price">
                {formatMoney(p.price, p.currency || currency)}
                <span> / {p.billing_interval}</span>
              </div>

              <ul className="plan-features-list">
                {(p.features || []).map((f: string, idx: number) => (
                  <li key={idx}>
                    <Check size={13} />
                    <span>{f}</span>
                  </li>
                ))}
                {p.trial_days > 0 && (
                  <li>
                    <Check size={13} />
                    <span>{p.trial_days}-day free trial period</span>
                  </li>
                )}
              </ul>
            </div>

            <div className="plan-card-foot">
              <div>
                <strong>{p.active_subscriptions_count || 0} active subs</strong>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                  MRR: {formatMoney(p.mrr || 0, currency)}
                </div>
              </div>
              <div className="action-pair">
                <button
                  type="button"
                  className="mini-action"
                  onClick={() => {
                    setFormError('');
                    setEditingPlan({
                      ...p,
                      featuresText: (p.features || []).join('\n'),
                    });
                  }}
                >
                  <Edit3 size={12} /> Edit
                </button>
                <button
                  type="button"
                  className="mini-action danger"
                  onClick={() => {
                    setFormError('');
                    setMigrateToPlanId('');
                    setDeletingPlan(p);
                  }}
                  title="Archive or delete plan"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Plan Modal */}
      {showCreate && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2>Create Subscription Plan</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowCreate(false)}
              >
                <X size={16} />
              </button>
            </div>
            {formError && <div className="form-error" style={{ marginBottom: 12 }}>{formError}</div>}
            <form onSubmit={handleCreatePlan} className="form-stack">
              <label>
                Plan Name *
                <input
                  required
                  value={newPlan.name}
                  onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                  placeholder="e.g. Enterprise Plus"
                />
              </label>
              <label>
                Description
                <input
                  value={newPlan.description}
                  onChange={(e) => setNewPlan({ ...newPlan, description: e.target.value })}
                  placeholder="Short summary of who this plan is for"
                />
              </label>
              <div className="form-row">
                <label>
                  Price ({currency}) *
                  <input
                    required
                    type="number"
                    min="0"
                    value={newPlan.price}
                    onChange={(e) => setNewPlan({ ...newPlan, price: e.target.value })}
                  />
                </label>
                <label>
                  Billing Interval
                  <select
                    value={newPlan.billing_interval}
                    onChange={(e) =>
                      setNewPlan({
                        ...newPlan,
                        billing_interval: e.target.value as BillingInterval,
                      })
                    }
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
              </div>
              <label>
                Free Trial Period (Days)
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={newPlan.trial_days}
                  onChange={(e) => setNewPlan({ ...newPlan, trial_days: e.target.value })}
                />
              </label>
              <label>
                Included Features (One per line)
                <textarea
                  rows={4}
                  value={newPlan.featuresText}
                  onChange={(e) => setNewPlan({ ...newPlan, featuresText: e.target.value })}
                />
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  <Plus size={14} /> Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Plan Modal */}
      {editingPlan && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2>Edit Plan — {editingPlan.code}</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setEditingPlan(null)}
              >
                <X size={16} />
              </button>
            </div>
            {formError && <div className="form-error" style={{ marginBottom: 12 }}>{formError}</div>}
            <form onSubmit={handleEditPlan} className="form-stack">
              <div className="form-row">
                <label>
                  Plan Name *
                  <input
                    required
                    value={editingPlan.name}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Status
                  <select
                    value={editingPlan.status}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, status: e.target.value })
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
              </div>
              <label>
                Description
                <input
                  value={editingPlan.description || ''}
                  onChange={(e) =>
                    setEditingPlan({ ...editingPlan, description: e.target.value })
                  }
                />
              </label>
              <div className="form-row">
                <label>
                  Price ({currency})
                  <input
                    type="number"
                    min="0"
                    value={editingPlan.price}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, price: e.target.value })
                    }
                  />
                </label>
                <label>
                  Billing Interval
                  <select
                    value={editingPlan.billing_interval}
                    onChange={(e) =>
                      setEditingPlan({ ...editingPlan, billing_interval: e.target.value })
                    }
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
              </div>
              <label>
                Trial Days
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={editingPlan.trial_days}
                  onChange={(e) =>
                    setEditingPlan({ ...editingPlan, trial_days: e.target.value })
                  }
                />
              </label>
              <label>
                Features (One per line)
                <textarea
                  rows={4}
                  value={editingPlan.featuresText}
                  onChange={(e) =>
                    setEditingPlan({ ...editingPlan, featuresText: e.target.value })
                  }
                />
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditingPlan(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Save Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Migrate Plan Modal */}
      {deletingPlan && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2>Delete or Archive Plan — {deletingPlan.name}</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setDeletingPlan(null)}
              >
                <X size={16} />
              </button>
            </div>
            {formError && <div className="form-error" style={{ marginBottom: 12 }}>{formError}</div>}
            <form onSubmit={handleDeletePlan} className="form-stack">
              {deletingPlan.active_subscriptions_count > 0 ? (
                <>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12.5 }}>
                    <strong>{deletingPlan.name}</strong> currently has{' '}
                    <strong>{deletingPlan.active_subscriptions_count} active subscription(s)</strong>
                    . Active plans cannot be deleted without migrating subscribers to another plan
                    first.
                  </p>
                  <label>
                    Migrate Active Subscribers To *
                    <select
                      required
                      value={migrateToPlanId}
                      onChange={(e) => setMigrateToPlanId(e.target.value)}
                    >
                      <option value="">Select migration target plan...</option>
                      {plans
                        .filter((p) => p.id !== deletingPlan.id && p.status === 'active')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({formatMoney(p.price, currency)} / {p.billing_interval})
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 12.5 }}>
                  Are you sure you want to remove <strong>{deletingPlan.name}</strong>?
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setDeletingPlan(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="danger-button">
                  {deletingPlan.active_subscriptions_count > 0
                    ? 'Migrate Subscribers & Archive Plan'
                    : 'Confirm Delete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
