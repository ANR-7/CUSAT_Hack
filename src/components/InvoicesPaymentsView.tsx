import React, { useState } from 'react';
import {
  Check,
  CheckCheck,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  Eye,
  FileText,
  Mail,
  Plus,
  Printer,
  RotateCcw,
  ShieldCheck,
  Target,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { apiRequest } from '../api';
import { Invoice, Organization, Payment } from '../../server/types';
import {
  downloadCsv,
  formatDate,
  formatMoney,
  formatMoneyExact,
  formatStatusLabel,
} from '../utils/format';
import { generateInvoicePdfDocument } from '../utils/invoicePdf';

interface InvoicesViewProps {
  organization: Organization;
  invoices: any[];
  customers: any[];
  subscriptions: any[];
  onDataMutated: () => void;
  notify: (msg: string) => void;
}

export function InvoicesView({
  organization,
  invoices,
  customers,
  subscriptions,
  onDataMutated,
  notify,
}: InvoicesViewProps) {
  const currency = organization.currency || 'INR';
  const [filter, setFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [checkoutOrder, setCheckoutOrder] = useState<any | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [formError, setFormError] = useState('');

  const [newInv, setNewInv] = useState({
    customer_id: customers[0]?.id || '',
    subscription_id: '',
    discount_amount: '0',
    tax_rate: String(organization.tax_rate ?? 18),
    due_date: '2026-11-10',
    status: 'pending' as 'pending' | 'draft',
    notes: '',
    line_items: [{ description: 'Pro Monthly Subscription', quantity: 1, unit_price: 8400 }],
  });

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      await apiRequest('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: newInv.customer_id || customers[0]?.id,
          subscription_id: newInv.subscription_id || null,
          line_items: newInv.line_items.map((li) => ({
            description: li.description,
            quantity: Number(li.quantity) || 1,
            unit_price: Number(li.unit_price) || 0,
          })),
          discount_amount: Number(newInv.discount_amount) || 0,
          tax_rate: Number(newInv.tax_rate) ?? organization.tax_rate,
          due_date: newInv.due_date,
          status: newInv.status,
          notes: newInv.notes,
        }),
      });
      setShowCreateModal(false);
      notify('Invoice generated with server-side tax calculation');
      onDataMutated();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create invoice');
    }
  };

  const handleSendReminder = async (inv: any) => {
    try {
      const res = await apiRequest(`/api/invoices/${inv.id}/send-reminder`, {
        method: 'POST',
      });
      notify(res.message || 'Payment reminder logged');
      onDataMutated();
    } catch (err: any) {
      notify(err.message || 'Failed to send reminder');
    }
  };

  const initiatePaymentCheckout = async (inv: any) => {
    try {
      const orderData = await apiRequest('/api/payments/razorpay/create-order', {
        method: 'POST',
        body: JSON.stringify({ invoice_id: inv.id }),
      });
      setCheckoutOrder({ ...orderData, invoice: inv });
    } catch (err: any) {
      notify(err.message || 'Could not initiate payment order');
    }
  };

  const handleSimulatedDemoPayment = async (outcome: 'success' | 'failed') => {
    if (!checkoutOrder) return;
    setProcessingPayment(true);
    try {
      const res = await apiRequest('/api/payments/simulate', {
        method: 'POST',
        body: JSON.stringify({
          invoice_id: checkoutOrder.invoice_id,
          outcome,
          payment_method: paymentMethod,
        }),
      });
      setCheckoutOrder(null);
      notify(res.message);
      onDataMutated();
    } catch (err: any) {
      notify(err.message || 'Simulated payment error');
    } finally {
      setProcessingPayment(false);
    }
  };

  const filteredInvoices = invoices.filter(
    (i) => filter === 'all' || i.status === filter
  );

  const totalInvoiced = invoices
    .filter((i) => i.status !== 'void' && i.status !== 'draft')
    .reduce((sum, i) => sum + Number(i.total_amount || 0), 0);
  const totalPaid = invoices
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + Number(i.total_amount || 0), 0);
  const totalOverdue = invoices
    .filter((i) => i.status === 'overdue')
    .reduce((sum, i) => sum + Number(i.total_amount || 0), 0);
  const failedCount = invoices.filter((i) => i.status === 'payment_failed').length;

  const previewSubtotal = newInv.line_items.reduce(
    (s, li) => s + (Number(li.quantity) || 1) * (Number(li.unit_price) || 0),
    0
  );
  const previewDiscount = Math.min(previewSubtotal, Number(newInv.discount_amount) || 0);
  const previewTax =
    ((previewSubtotal - previewDiscount) * (Number(newInv.tax_rate) || 0)) / 100;
  const previewTotal = previewSubtotal - previewDiscount + previewTax;

  return (
    <div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TAX INVOICING & RECEIVABLES</div>
          <h1>Invoices</h1>
          <p>
            Generate GST/tax-compliant invoices, download printable statements, and recover
            overdue balances.
          </p>
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              downloadCsv('revive-invoices.csv', [
                ['Invoice #', 'Customer', 'Issued', 'Due Date', 'Subtotal', 'Tax', 'Total', 'Status'],
                ...invoices.map((i) => [
                  i.invoice_number,
                  i.customer_name,
                  i.issue_date,
                  i.due_date,
                  i.subtotal,
                  i.tax_amount,
                  i.total_amount,
                  i.status,
                ]),
              ]);
              notify('Invoices CSV exported');
            }}
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setFormError('');
              setNewInv({
                ...newInv,
                customer_id: customers[0]?.id || '',
              });
              setShowCreateModal(true);
            }}
          >
            <Plus size={14} /> Create Invoice
          </button>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span>Total Invoiced</span>
            <div className="metric-icon blue">
              <FileText size={15} />
            </div>
          </div>
          <div className="metric-value">{formatMoney(totalInvoiced, currency)}</div>
          <div className="metric-foot">
            <span>{invoices.length} total invoices</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>Settled / Paid</span>
            <div className="metric-icon green">
              <CheckCircle2 size={15} />
            </div>
          </div>
          <div className="metric-value">{formatMoney(totalPaid, currency)}</div>
          <div className="metric-foot">
            <span>Verified & reconciled</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>Overdue Receivables</span>
            <div className="metric-icon red">
              <Clock3 size={15} />
            </div>
          </div>
          <div className="metric-value">{formatMoney(totalOverdue, currency)}</div>
          <div className="metric-foot">
            <span>Past payment due date</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>Failed Payment Invoices</span>
            <div className="metric-icon amber">
              <CreditCard size={15} />
            </div>
          </div>
          <div className="metric-value">{failedCount}</div>
          <div className="metric-foot">
            <span>Require retry or checkout link</span>
          </div>
        </div>
      </div>

      <section className="panel">
        <div className="table-toolbar">
          <div className="filter-tabs">
            {[
              ['all', 'All Invoices'],
              ['pending', 'Pending'],
              ['paid', 'Paid'],
              ['overdue', 'Overdue'],
              ['payment_failed', 'Payment Failed'],
              ['draft', 'Draft'],
              ['refunded', 'Refunded'],
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

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Issued</th>
                <th>Due Date</th>
                <th>Subtotal</th>
                <th>Tax ({organization.tax_rate}%)</th>
                <th>Total Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <FileText size={22} />
                      <strong>No invoices in this view</strong>
                      <p>Create a new invoice or switch the status filter above.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="mono">{inv.invoice_number}</td>
                    <td>
                      <strong>{inv.customer_name}</strong>
                      <small>{inv.customer_email}</small>
                    </td>
                    <td>{formatDate(inv.issue_date)}</td>
                    <td>{formatDate(inv.due_date)}</td>
                    <td className="amount-cell">{formatMoney(inv.subtotal, inv.currency)}</td>
                    <td className="amount-cell">{formatMoney(inv.tax_amount, inv.currency)}</td>
                    <td className="amount-cell">{formatMoney(inv.total_amount, inv.currency)}</td>
                    <td>
                      <span className={`status-pill ${inv.status}`}>
                        <i />
                        {formatStatusLabel(inv.status)}
                      </span>
                    </td>
                    <td>
                      <div className="action-pair">
                        <button
                          type="button"
                          className="mini-action"
                          onClick={() => setSelectedInvoice(inv)}
                          title="Inspect invoice details"
                        >
                          <Eye size={12} /> View
                        </button>
                        <button
                          type="button"
                          className="mini-action"
                          onClick={() =>
                            generateInvoicePdfDocument(inv, organization, 'download')
                          }
                          title="Download printable invoice"
                        >
                          <Download size={12} /> PDF
                        </button>
                        {inv.status !== 'paid' && inv.status !== 'refunded' && (
                          <>
                            <button
                              type="button"
                              className="mini-action"
                              onClick={() => handleSendReminder(inv)}
                              title="Send dunning reminder"
                            >
                              <Mail size={12} /> Remind
                            </button>
                            <button
                              type="button"
                              className="mini-action success"
                              onClick={() => initiatePaymentCheckout(inv)}
                              title="Collect payment via Razorpay / Demo Checkout"
                            >
                              <CreditCard size={12} /> Pay
                            </button>
                          </>
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

      {/* Create Multi-Line Invoice Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal wide">
            <div className="modal-header">
              <h2>Generate Tax Invoice</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowCreateModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            {formError && <div className="form-error" style={{ marginBottom: 12 }}>{formError}</div>}
            <form onSubmit={handleCreateInvoice} className="form-stack">
              <div className="form-row">
                <label>
                  Customer *
                  <select
                    required
                    value={newInv.customer_id}
                    onChange={(e) =>
                      setNewInv({ ...newInv, customer_id: e.target.value })
                    }
                  >
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
                  Linked Subscription (Optional)
                  <select
                    value={newInv.subscription_id}
                    onChange={(e) =>
                      setNewInv({ ...newInv, subscription_id: e.target.value })
                    }
                  >
                    <option value="">Standalone One-Time Invoice</option>
                    {subscriptions
                      .filter((s) => s.customer_id === newInv.customer_id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} — {s.plan_name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <strong style={{ fontSize: 12 }}>Invoice Line Items</strong>
                  <button
                    type="button"
                    className="mini-action"
                    onClick={() =>
                      setNewInv({
                        ...newInv,
                        line_items: [
                          ...newInv.line_items,
                          { description: 'Add-on service', quantity: 1, unit_price: 2500 },
                        ],
                      })
                    }
                  >
                    <Plus size={12} /> Add Line Item
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {newInv.line_items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 90px 130px 34px',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      <input
                        required
                        placeholder="Item description"
                        value={item.description}
                        onChange={(e) => {
                          const updated = [...newInv.line_items];
                          updated[idx].description = e.target.value;
                          setNewInv({ ...newInv, line_items: updated });
                        }}
                      />
                      <input
                        required
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => {
                          const updated = [...newInv.line_items];
                          updated[idx].quantity = Number(e.target.value) || 1;
                          setNewInv({ ...newInv, line_items: updated });
                        }}
                      />
                      <input
                        required
                        type="number"
                        min="0"
                        placeholder="Unit Price"
                        value={item.unit_price}
                        onChange={(e) => {
                          const updated = [...newInv.line_items];
                          updated[idx].unit_price = Number(e.target.value) || 0;
                          setNewInv({ ...newInv, line_items: updated });
                        }}
                      />
                      <button
                        type="button"
                        className="icon-button"
                        disabled={newInv.line_items.length <= 1}
                        onClick={() =>
                          setNewInv({
                            ...newInv,
                            line_items: newInv.line_items.filter((_, i) => i !== idx),
                          })
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <label>
                  Discount Amount ({currency})
                  <input
                    type="number"
                    min="0"
                    value={newInv.discount_amount}
                    onChange={(e) =>
                      setNewInv({ ...newInv, discount_amount: e.target.value })
                    }
                  />
                </label>
                <label>
                  Tax / GST Rate (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={newInv.tax_rate}
                    onChange={(e) => setNewInv({ ...newInv, tax_rate: e.target.value })}
                  />
                </label>
              </div>

              <div className="form-row">
                <label>
                  Due Date *
                  <input
                    required
                    type="date"
                    value={newInv.due_date}
                    onChange={(e) => setNewInv({ ...newInv, due_date: e.target.value })}
                  />
                </label>
                <label>
                  Initial Status
                  <select
                    value={newInv.status}
                    onChange={(e) =>
                      setNewInv({
                        ...newInv,
                        status: e.target.value as 'pending' | 'draft',
                      })
                    }
                  >
                    <option value="pending">Pending (Issued)</option>
                    <option value="draft">Draft</option>
                  </select>
                </label>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 6,
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Subtotal: {formatMoneyExact(previewSubtotal, currency)} · Discount: -
                  {formatMoneyExact(previewDiscount, currency)} · Tax:{' '}
                  {formatMoneyExact(previewTax, currency)}
                </span>
                <strong style={{ fontSize: 14 }}>
                  Total: {formatMoneyExact(previewTotal, currency)}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  <Plus size={14} /> Issue Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="modal-backdrop">
          <div className="modal wide">
            <div className="modal-header">
              <div>
                <div className="eyebrow">TAX INVOICE STATEMENT</div>
                <h2>
                  {selectedInvoice.invoice_number} — {selectedInvoice.customer_name}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSelectedInvoice(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
                padding: 14,
                background: 'var(--bg-subtle)',
                borderRadius: 6,
                marginBottom: 16,
              }}
            >
              <div>
                <div className="eyebrow">FROM</div>
                <strong>{organization.name}</strong>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  {organization.address}
                  <br />
                  GSTIN: {organization.tax_id || 'N/A'} · {organization.billing_email}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="eyebrow">BILLED TO</div>
                <strong>
                  {selectedInvoice.customer_company || selectedInvoice.customer_name}
                </strong>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  {selectedInvoice.customer_email}
                  <br />
                  Issued: {formatDate(selectedInvoice.issue_date)} · Due:{' '}
                  {formatDate(selectedInvoice.due_date)}
                </div>
              </div>
            </div>

            <div className="table-wrap" style={{ border: '1px solid var(--border-subtle)', borderRadius: 6, marginBottom: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedInvoice.line_items || []).map((li: any, idx: number) => (
                    <tr key={idx}>
                      <td>
                        <strong>{li.description}</strong>
                      </td>
                      <td>{li.quantity}</td>
                      <td className="amount-cell">
                        {formatMoneyExact(li.unit_price, selectedInvoice.currency)}
                      </td>
                      <td className="amount-cell">
                        {formatMoneyExact(li.amount, selectedInvoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: 12,
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <span className={`status-pill ${selectedInvoice.status}`}>
                  <i />
                  {formatStatusLabel(selectedInvoice.status)}
                </span>
                <span style={{ marginLeft: 12, fontSize: 12 }}>
                  Total Due:{' '}
                  <strong>
                    {formatMoneyExact(selectedInvoice.total_amount, selectedInvoice.currency)}
                  </strong>
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    generateInvoicePdfDocument(selectedInvoice, organization, 'print')
                  }
                >
                  <Printer size={14} /> Print / Save PDF
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    generateInvoicePdfDocument(selectedInvoice, organization, 'download')
                  }
                >
                  <Download size={14} /> Download Invoice
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Razorpay Test Mode & Demo Payment Checkout Modal */}
      {checkoutOrder && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="eyebrow">PAYMENT GATEWAY CHECKOUT</div>
                <h2>Settle Invoice {checkoutOrder.invoice_number}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setCheckoutOrder(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="form-stack">
              <div
                style={{
                  padding: 14,
                  borderRadius: 6,
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Order Reference</span>
                  <span className="mono">{checkoutOrder.order_id}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Customer</span>
                  <strong>{checkoutOrder.customer?.name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Payable Amount</span>
                  <strong style={{ fontSize: 16 }}>
                    {formatMoneyExact(checkoutOrder.amount / 100, checkoutOrder.currency)}
                  </strong>
                </div>
              </div>

              <label>
                Payment Instrument
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="UPI">UPI (Google Pay / PhonePe / VPA)</option>
                  <option value="Card">Corporate Credit / Debit Card</option>
                  <option value="Bank transfer">NEFT / RTGS Netbanking</option>
                </select>
              </label>

              <div
                style={{
                  padding: 12,
                  borderRadius: 6,
                  border: '1px solid var(--status-info-border)',
                  background: 'var(--status-info-bg)',
                  fontSize: 11.5,
                  color: 'var(--text-primary)',
                }}
              >
                <strong>Explicit Demo Mode & Razorpay Test Disclosure:</strong>
                <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>
                  {checkoutOrder.notice ||
                    'Razorpay Test Order initialized. Choose whether to simulate a successful Demo payment or a bank decline.'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="danger-button"
                  disabled={processingPayment}
                  onClick={() => handleSimulatedDemoPayment('failed')}
                >
                  Simulate Bank Decline
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={processingPayment}
                  onClick={() => handleSimulatedDemoPayment('success')}
                >
                  <CheckCircle2 size={14} /> Complete Demo Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface PaymentsViewProps {
  organization: Organization;
  payments: any[];
  invoices: any[];
  razorpayConfigured: boolean;
  onDataMutated: () => void;
  notify: (msg: string) => void;
}

export function PaymentsView({
  organization,
  payments,
  invoices,
  razorpayConfigured,
  onDataMutated,
  notify,
}: PaymentsViewProps) {
  const currency = organization.currency || 'INR';
  const [filter, setFilter] = useState('all');
  const [refundingPayment, setRefundingPayment] = useState<any | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [reconciling, setReconciling] = useState(false);

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const res = await apiRequest('/api/payments/reconcile', { method: 'POST' });
      notify(res.message || 'Reconciliation complete');
      onDataMutated();
    } catch (err: any) {
      notify(err.message || 'Reconciliation failed');
    } finally {
      setReconciling(false);
    }
  };

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundingPayment) return;
    try {
      await apiRequest(`/api/payments/${refundingPayment.id}/refund`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(refundAmount) }),
      });
      setRefundingPayment(null);
      notify(`Refund processed for ${refundingPayment.payment_number}`);
      onDataMutated();
    } catch (err: any) {
      notify(err.message || 'Refund failed');
    }
  };

  const capturedPayments = payments.filter(
    (p) => p.status === 'captured' || p.status === 'partially_refunded'
  );
  const netCollected = capturedPayments.reduce(
    (sum, p) => sum + Math.max(0, Number(p.amount) - Number(p.refunded_amount || 0)),
    0
  );
  const verifiedCount = payments.filter((p) => p.is_verified).length;
  const failedPayments = payments.filter((p) => p.status === 'failed');

  const filteredPayments = payments.filter(
    (p) => filter === 'all' || p.status === filter
  );

  return (
    <div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PAYMENT LEDGER & RAZORPAY RECONCILIATION</div>
          <h1>Payments</h1>
          <p>
            Track verified Razorpay transactions, simulated demo settlements, failed attempts, and
            refunds.
          </p>
        </div>
        <div className="heading-actions">
          <span className={`status-pill ${razorpayConfigured ? 'active' : 'pending'}`}>
            <i />
            {razorpayConfigured ? 'Razorpay Test API Active' : 'Demo Payment Simulator Active'}
          </span>
          <button
            type="button"
            className="secondary-button"
            onClick={handleReconcile}
            disabled={reconciling}
          >
            <CheckCheck size={14} /> {reconciling ? 'Reconciling...' : 'Reconcile Ledger'}
          </button>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-top">
            <span>Net Collected Cash</span>
            <div className="metric-icon green">
              <CircleDollarSign size={15} />
            </div>
          </div>
          <div className="metric-value">{formatMoney(netCollected, currency)}</div>
          <div className="metric-foot">
            <span>{capturedPayments.length} captured transactions</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>Verified Razorpay Payments</span>
            <div className="metric-icon blue">
              <ShieldCheck size={15} />
            </div>
          </div>
          <div className="metric-value">{verifiedCount}</div>
          <div className="metric-foot">
            <span>HMAC-SHA256 signature verified</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>Failed Transactions</span>
            <div className="metric-icon red">
              <CreditCard size={15} />
            </div>
          </div>
          <div className="metric-value">{failedPayments.length}</div>
          <div className="metric-foot">
            <span>Logged with bank decline codes</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-top">
            <span>Simulated Demo Payments</span>
            <div className="metric-icon amber">
              <Wallet size={15} />
            </div>
          </div>
          <div className="metric-value">
            {payments.filter((p) => p.provider === 'simulated_demo').length}
          </div>
          <div className="metric-foot">
            <span>Explicitly labelled demo records</span>
          </div>
        </div>
      </div>

      <section className="panel">
        <div className="table-toolbar">
          <div className="filter-tabs">
            {[
              ['all', 'All Transactions'],
              ['captured', 'Captured'],
              ['failed', 'Failed'],
              ['refunded', 'Refunded'],
              ['partially_refunded', 'Partially Refunded'],
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

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Payment ID</th>
                <th>Customer</th>
                <th>Invoice Ref</th>
                <th>Method</th>
                <th>Verification Source</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <CreditCard size={22} />
                      <strong>No payment records found</strong>
                      <p>Settle an invoice to record a payment transaction.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPayments.map((pay) => (
                  <tr key={pay.id}>
                    <td className="mono">{pay.payment_number}</td>
                    <td>
                      <strong>{pay.customer_name}</strong>
                      <small>{pay.customer_email}</small>
                    </td>
                    <td className="mono">{pay.invoice_number}</td>
                    <td>{pay.payment_method}</td>
                    <td>
                      <span
                        className={`status-pill ${
                          pay.is_verified ? 'active' : 'pending'
                        }`}
                      >
                        <i />
                        {pay.is_verified
                          ? 'Verified Razorpay'
                          : pay.provider === 'simulated_demo'
                            ? 'Simulated Demo'
                            : 'Unverified'}
                      </span>
                    </td>
                    <td>{formatDate(pay.paid_at || pay.created_at)}</td>
                    <td className="amount-cell">
                      {formatMoney(pay.amount, pay.currency)}
                      {pay.refunded_amount > 0 && (
                        <small style={{ color: 'var(--status-warning)' }}>
                          Refunded: {formatMoney(pay.refunded_amount, pay.currency)}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${pay.status}`}>
                        <i />
                        {formatStatusLabel(pay.status)}
                      </span>
                      {pay.failure_reason && (
                        <small title={pay.failure_reason}>
                          {pay.failure_reason.slice(0, 40)}...
                        </small>
                      )}
                    </td>
                    <td>
                      {(pay.status === 'captured' || pay.status === 'partially_refunded') && (
                        <button
                          type="button"
                          className="mini-action"
                          onClick={() => {
                            const remaining = pay.amount - (pay.refunded_amount || 0);
                            setRefundAmount(String(remaining));
                            setRefundingPayment(pay);
                          }}
                        >
                          <RotateCcw size={12} /> Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {refundingPayment && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2>Issue Refund — {refundingPayment.payment_number}</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setRefundingPayment(null)}
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleRefund} className="form-stack">
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                Original payment: <strong>{formatMoney(refundingPayment.amount, currency)}</strong>.
                Already refunded:{' '}
                <strong>{formatMoney(refundingPayment.refunded_amount || 0, currency)}</strong>.
              </p>
              <label>
                Refund Amount ({currency}) *
                <input
                  required
                  type="number"
                  min="1"
                  max={refundingPayment.amount - (refundingPayment.refunded_amount || 0)}
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                />
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setRefundingPayment(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="danger-button">
                  Process Refund
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
