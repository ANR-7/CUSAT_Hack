import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowUpDown,
  CheckCircle2,
  CircleDollarSign,
  Download,
  Edit3,
  Eye,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { apiRequest } from '../api';
import { Customer, Organization, Plan } from '../../server/types';
import {
  downloadCsv,
  formatDate,
  formatMoney,
  formatStatusLabel,
} from '../utils/format';

interface CustomersViewProps {
  organization: Organization;
  plans: Plan[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onDataMutated: () => void;
  notify: (msg: string) => void;
}

export function CustomersView({
  organization,
  plans,
  searchQuery,
  setSearchQuery,
  onDataMutated,
  notify,
}: CustomersViewProps) {
  const currency = organization.currency || 'INR';
  const [customers, setCustomers] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [loading, setLoading] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);

  const [formState, setFormState] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    tax_id: '',
    billing_address: '',
    preferred_payment_method: 'UPI',
    notes: '',
    initial_plan_id: '',
  });
  const [formError, setFormError] = useState('');

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search: searchQuery,
        status: statusFilter,
        sortBy,
        sortDir,
        page: String(page),
        limit: '10',
      });
      const res = await apiRequest(`/api/customers?${params.toString()}`);
      setCustomers(res.customers || []);
      setPagination(res.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 });
    } catch (err: any) {
      notify(err.message || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [organization.id, searchQuery, statusFilter, sortBy, sortDir, page]);

  const openCustomerDetail = async (id: string) => {
    try {
      const res = await apiRequest(`/api/customers/${id}`);
      setDetailData(res);
    } catch (err: any) {
      notify(err.message || 'Failed to load customer details');
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      await apiRequest('/api/customers', {
        method: 'POST',
        body: JSON.stringify({
          ...formState,
          initial_plan_id: formState.initial_plan_id || undefined,
        }),
      });
      setShowCreateModal(false);
      setFormState({
        name: '',
        email: '',
        phone: '',
        company: '',
        tax_id: '',
        billing_address: '',
        preferred_payment_method: 'UPI',
        notes: '',
        initial_plan_id: '',
      });
      notify('Customer record created');
      fetchCustomers();
      onDataMutated();
    } catch (err: any) {
      setFormError(err.message || 'Could not create customer');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    setFormError('');
    try {
      await apiRequest(`/api/customers/${editingCustomer.id}`, {
        method: 'PUT',
        body: JSON.stringify(editingCustomer),
      });
      setEditingCustomer(null);
      notify('Customer updated');
      fetchCustomers();
      onDataMutated();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update customer');
    }
  };

  const handleArchiveCustomer = async (cust: any) => {
    if (
      !window.confirm(
        `Archive customer "${cust.name}"? Any active subscriptions for this customer will be cancelled.`
      )
    ) {
      return;
    }
    try {
      await apiRequest(`/api/customers/${cust.id}`, { method: 'DELETE' });
      notify(`Customer ${cust.name} archived`);
      if (detailData?.customer?.id === cust.id) setDetailData(null);
      fetchCustomers();
      onDataMutated();
    } catch (err: any) {
      notify(err.message || 'Failed to archive customer');
    }
  };

  const handleExportCsv = () => {
    downloadCsv('revive-customers.csv', [
      [
        'Code',
        'Customer Name',
        'Email',
        'Company',
        'Plan',
        'MRR',
        'Lifetime Value',
        'Status',
        'Risk Score',
      ],
      ...customers.map((c) => [
        c.external_code,
        c.name,
        c.email,
        c.company,
        c.primary_plan_name,
        c.mrr,
        c.lifetime_value,
        c.status,
        c.risk_score,
      ]),
    ]);
    notify('Customer CSV exported');
  };

  const totalMrr = customers.reduce((s, c) => s + Number(c.mrr || 0), 0);
  const totalLtv = customers.reduce((s, c) => s + Number(c.lifetime_value || 0), 0);

  return (
    <div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CUSTOMER DIRECTORY & HEALTH</div>
          <h1>Customers</h1>
          <p>
            Manage subscriber accounts, monitor payment risk signals, and inspect lifetime value.
          </p>
        </div>
        <div className="heading-actions">
          <button type="button" className="secondary-button" onClick={handleExportCsv}>
            <Download size={14} /> Export CSV
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setFormError('');
              setShowCreateModal(true);
            }}
          >
            <Plus size={14} /> Add Customer
          </button>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span>Total Matching Customers</span>
            <div className="metric-icon blue">
              <Users size={15} />
            </div>
          </div>
          <div className="metric-value">{pagination.total}</div>
          <div className="metric-foot">
            <span>Active directory records</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>Healthy Accounts</span>
            <div className="metric-icon green">
              <CheckCircle2 size={15} />
            </div>
          </div>
          <div className="metric-value">
            {customers.filter((c) => c.status === 'active').length}
          </div>
          <div className="metric-foot">
            <span>On-time billing status</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>At-Risk / Past Due</span>
            <div className="metric-icon red">
              <AlertCircle size={15} />
            </div>
          </div>
          <div className="metric-value">
            {customers.filter((c) => c.status === 'at_risk' || c.status === 'past_due').length}
          </div>
          <div className="metric-foot">
            <span>Require dunning or outreach</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>Cumulative Lifetime Value (LTV)</span>
            <div className="metric-icon amber">
              <CircleDollarSign size={15} />
            </div>
          </div>
          <div className="metric-value">{formatMoney(totalLtv, currency)}</div>
          <div className="metric-foot">
            <span>Active MRR: {formatMoney(totalMrr, currency)}</span>
          </div>
        </div>
      </div>

      <section className="panel">
        <div className="table-toolbar">
          <div className="toolbar-left">
            <div className="search-field">
              <Search size={14} />
              <input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name, email, code, plan..."
              />
            </div>

            <div className="filter-tabs">
              {[
                ['all', 'All Active'],
                ['active', 'Healthy'],
                ['at_risk', 'At Risk'],
                ['past_due', 'Past Due'],
                ['churned', 'Churned'],
                ['archived', 'Archived'],
              ].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  className={statusFilter === val ? 'selected' : ''}
                  onClick={() => {
                    setStatusFilter(val);
                    setPage(1);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="toolbar-right">
            <select
              className="small-select"
              value={`${sortBy}:${sortDir}`}
              onChange={(e) => {
                const [by, dir] = e.target.value.split(':');
                setSortBy(by);
                setSortDir(dir as 'asc' | 'desc');
              }}
            >
              <option value="created_at:desc">Sort: Newest first</option>
              <option value="mrr:desc">Sort: Highest MRR</option>
              <option value="ltv:desc">Sort: Highest LTV</option>
              <option value="risk_score:desc">Sort: Highest Risk</option>
              <option value="name:asc">Sort: Name (A–Z)</option>
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Primary Plan</th>
                <th>Monthly Value (MRR)</th>
                <th>Lifetime Value (LTV)</th>
                <th>Status</th>
                <th>Risk Score</th>
                <th>Last Payment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 28 }}>
                    Loading customer records...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <Users size={24} />
                      <strong>No customers match your current filter</strong>
                      <p>Add a new customer or clear your search filter.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="customer-cell">
                        <div className="customer-logo">
                          {c.name
                            .split(/[\s&]/)
                            .filter(Boolean)
                            .map((x: string) => x[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                        </div>
                        <div>
                          <strong>{c.name}</strong>
                          <small>
                            {c.email} · <span className="mono">{c.external_code}</span>
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>{c.primary_plan_name}</td>
                    <td className="amount-cell">{formatMoney(c.mrr, currency)}</td>
                    <td className="amount-cell">{formatMoney(c.lifetime_value, currency)}</td>
                    <td>
                      <span className={`status-pill ${c.status}`}>
                        <i />
                        {formatStatusLabel(c.status)}
                      </span>
                    </td>
                    <td>
                      <div className="risk-wrap" title={c.risk_reason}>
                        <div className="risk-track">
                          <i
                            style={{ width: `${c.risk_score}%` }}
                            className={
                              c.risk_score >= 65
                                ? 'high'
                                : c.risk_score >= 35
                                  ? 'medium'
                                  : 'low'
                            }
                          />
                        </div>
                        <span className="mono">{c.risk_score}/100</span>
                      </div>
                    </td>
                    <td>{c.last_payment_date ? formatDate(c.last_payment_date) : 'No payments'}</td>
                    <td>
                      <div className="action-pair">
                        <button
                          type="button"
                          className="mini-action"
                          onClick={() => openCustomerDetail(c.id)}
                          title="Inspect customer details & history"
                        >
                          <Eye size={12} /> View
                        </button>
                        <button
                          type="button"
                          className="mini-action"
                          onClick={() => {
                            setFormError('');
                            setEditingCustomer({ ...c });
                          }}
                          title="Edit customer"
                        >
                          <Edit3 size={12} />
                        </button>
                        {c.status !== 'archived' && (
                          <button
                            type="button"
                            className="mini-action danger"
                            onClick={() => handleArchiveCustomer(c)}
                            title="Archive customer"
                          >
                            <Archive size={12} />
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

        <div className="table-footer">
          <span>
            Showing {customers.length} of {pagination.total} customer(s) · Page {pagination.page}{' '}
            of {pagination.totalPages}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="mini-action"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="mini-action"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {/* Create Customer Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2>Add New Customer</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowCreateModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            {formError && <div className="form-error" style={{ marginBottom: 12 }}>{formError}</div>}
            <form onSubmit={handleCreateSubmit} className="form-stack">
              <div className="form-row">
                <label>
                  Customer / Account Name *
                  <input
                    required
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    placeholder="e.g. Horizon Robotics"
                  />
                </label>
                <label>
                  Billing Email *
                  <input
                    required
                    type="email"
                    value={formState.email}
                    onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                    placeholder="finance@horizon.io"
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Legal Company Name
                  <input
                    value={formState.company}
                    onChange={(e) => setFormState({ ...formState, company: e.target.value })}
                    placeholder="Horizon Robotics Pvt Ltd"
                  />
                </label>
                <label>
                  Phone Number
                  <input
                    value={formState.phone}
                    onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                    placeholder="+91 98450 00000"
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Tax ID / GSTIN
                  <input
                    value={formState.tax_id}
                    onChange={(e) => setFormState({ ...formState, tax_id: e.target.value })}
                    placeholder="29AAACH0000A1Z5"
                  />
                </label>
                <label>
                  Preferred Payment Method
                  <select
                    value={formState.preferred_payment_method}
                    onChange={(e) =>
                      setFormState({ ...formState, preferred_payment_method: e.target.value })
                    }
                  >
                    <option value="UPI">UPI AutoPay</option>
                    <option value="Card">Corporate Card</option>
                    <option value="Bank transfer">NEFT / RTGS Bank Transfer</option>
                  </select>
                </label>
              </div>
              <label>
                Billing Address
                <input
                  value={formState.billing_address}
                  onChange={(e) =>
                    setFormState({ ...formState, billing_address: e.target.value })
                  }
                  placeholder="Street, City, State, PIN"
                />
              </label>
              <label>
                Initial Subscription Plan (Optional)
                <select
                  value={formState.initial_plan_id}
                  onChange={(e) =>
                    setFormState({ ...formState, initial_plan_id: e.target.value })
                  }
                >
                  <option value="">Do not assign a plan yet</option>
                  {plans
                    .filter((p) => p.status === 'active')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {formatMoney(p.price, p.currency)} / {p.billing_interval}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Account Notes
                <textarea
                  rows={2}
                  value={formState.notes}
                  onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
                  placeholder="Internal notes about billing terms or contacts..."
                />
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  <Plus size={14} /> Create Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2>Edit Customer — {editingCustomer.external_code}</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setEditingCustomer(null)}
              >
                <X size={16} />
              </button>
            </div>
            {formError && <div className="form-error" style={{ marginBottom: 12 }}>{formError}</div>}
            <form onSubmit={handleEditSubmit} className="form-stack">
              <div className="form-row">
                <label>
                  Customer Name *
                  <input
                    required
                    value={editingCustomer.name}
                    onChange={(e) =>
                      setEditingCustomer({ ...editingCustomer, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Billing Email *
                  <input
                    required
                    type="email"
                    value={editingCustomer.email}
                    onChange={(e) =>
                      setEditingCustomer({ ...editingCustomer, email: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Company
                  <input
                    value={editingCustomer.company || ''}
                    onChange={(e) =>
                      setEditingCustomer({ ...editingCustomer, company: e.target.value })
                    }
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={editingCustomer.phone || ''}
                    onChange={(e) =>
                      setEditingCustomer({ ...editingCustomer, phone: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Tax ID / GSTIN
                  <input
                    value={editingCustomer.tax_id || ''}
                    onChange={(e) =>
                      setEditingCustomer({ ...editingCustomer, tax_id: e.target.value })
                    }
                  />
                </label>
                <label>
                  Account Status
                  <select
                    value={editingCustomer.status}
                    onChange={(e) =>
                      setEditingCustomer({ ...editingCustomer, status: e.target.value })
                    }
                  >
                    <option value="active">Active</option>
                    <option value="at_risk">At Risk</option>
                    <option value="past_due">Past Due</option>
                    <option value="churned">Churned</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
              </div>
              <label>
                Billing Address
                <input
                  value={editingCustomer.billing_address || ''}
                  onChange={(e) =>
                    setEditingCustomer({ ...editingCustomer, billing_address: e.target.value })
                  }
                />
              </label>
              <label>
                Notes
                <textarea
                  rows={2}
                  value={editingCustomer.notes || ''}
                  onChange={(e) =>
                    setEditingCustomer({ ...editingCustomer, notes: e.target.value })
                  }
                />
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditingCustomer(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer 360 Detail Modal */}
      {detailData && (
        <div className="modal-backdrop">
          <div className="modal wide">
            <div className="modal-header">
              <div>
                <div className="eyebrow">
                  CUSTOMER 360 · {detailData.customer.external_code}
                </div>
                <h2>{detailData.customer.name}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setDetailData(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="metrics-grid" style={{ marginBottom: 16 }}>
              <div className="metric-card">
                <div className="metric-top">
                  <span>Current MRR</span>
                </div>
                <div className="metric-value">
                  {formatMoney(detailData.customer.mrr, currency)}
                </div>
                <div className="metric-foot">
                  <span>{detailData.subscriptions.length} subscription(s)</span>
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-top">
                  <span>Lifetime Value (LTV)</span>
                </div>
                <div className="metric-value">
                  {formatMoney(detailData.customer.lifetime_value, currency)}
                </div>
                <div className="metric-foot">
                  <span>{detailData.payments.length} payment record(s)</span>
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-top">
                  <span>Health & Risk Score</span>
                </div>
                <div className="metric-value">{detailData.customer.risk_score}/100</div>
                <div className="metric-foot">
                  <span>{detailData.customer.risk_reason}</span>
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-top">
                  <span>Billing Profile</span>
                </div>
                <div style={{ fontSize: 12, marginTop: 8 }}>
                  <strong>{detailData.customer.email}</strong>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
                    GSTIN: {detailData.customer.tax_id || 'Not provided'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <h3 style={{ fontSize: 13, margin: '0 0 8px' }}>Subscription History</h3>
                <div className="table-wrap" style={{ border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Plan</th>
                        <th>Interval</th>
                        <th>MRR</th>
                        <th>Next Billing</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.subscriptions.length === 0 ? (
                        <tr>
                          <td colSpan={6}>No subscriptions</td>
                        </tr>
                      ) : (
                        detailData.subscriptions.map((s: any) => (
                          <tr key={s.id}>
                            <td className="mono">{s.code}</td>
                            <td>
                              <strong>{s.plan?.name || 'Plan'}</strong>
                            </td>
                            <td>{formatStatusLabel(s.billing_interval)}</td>
                            <td className="amount-cell">
                              {formatMoney(s.mrr_amount, s.currency)}
                            </td>
                            <td>{formatDate(s.next_billing_date)}</td>
                            <td>
                              <span className={`status-pill ${s.status}`}>
                                <i />
                                {formatStatusLabel(s.status)}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: 13, margin: '0 0 8px' }}>Invoices & Payment History</h3>
                <div className="table-wrap" style={{ border: '1px solid var(--border-subtle)', borderRadius: 6 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Issued</th>
                        <th>Due</th>
                        <th>Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.invoices.length === 0 ? (
                        <tr>
                          <td colSpan={5}>No invoices</td>
                        </tr>
                      ) : (
                        detailData.invoices.map((i: any) => (
                          <tr key={i.id}>
                            <td className="mono">{i.invoice_number}</td>
                            <td>{formatDate(i.issue_date)}</td>
                            <td>{formatDate(i.due_date)}</td>
                            <td className="amount-cell">
                              {formatMoney(i.total_amount, i.currency)}
                            </td>
                            <td>
                              <span className={`status-pill ${i.status}`}>
                                <i />
                                {formatStatusLabel(i.status)}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
