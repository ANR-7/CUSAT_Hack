import { Invoice, Organization } from '../../server/types';
import { formatDate, formatMoneyExact } from './format';

/**
 * Generates a standalone printable / downloadable Tax Invoice document (HTML/PDF-ready)
 * and triggers direct file download + optional print-to-PDF view.
 */
export function generateInvoicePdfDocument(
  invoice: Invoice & {
    customer_name?: string;
    customer_email?: string;
    customer_company?: string;
    customer_tax_id?: string;
    customer_address?: string;
  },
  organization: Organization,
  mode: 'download' | 'print' = 'download'
) {
  const currency = invoice.currency || organization.currency || 'INR';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Tax Invoice ${invoice.invoice_number} — ${organization.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
      color: #0f172a;
      background: #f8fafc;
      padding: 40px 20px;
      line-height: 1.5;
    }
    .sheet {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 48px;
      box-shadow: 0 4px 20px rgba(15, 23, 42, 0.04);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 32px;
      border-bottom: 1px solid #e2e8f0;
    }
    .brand {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
      color: #0f172a;
    }
    .org-meta {
      margin-top: 8px;
      font-size: 12px;
      color: #64748b;
    }
    .inv-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: ${invoice.status === 'paid' ? '#dcfce7' : invoice.status === 'overdue' || invoice.status === 'payment_failed' ? '#fee2e2' : '#fef3c7'};
      color: ${invoice.status === 'paid' ? '#166534' : invoice.status === 'overdue' || invoice.status === 'payment_failed' ? '#991b1b' : '#92400e'};
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      padding: 32px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #64748b;
      margin-bottom: 6px;
    }
    .val {
      font-size: 14px;
      font-weight: 600;
      color: #0f172a;
    }
    .sub-val {
      font-size: 12px;
      color: #475569;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 32px 0;
    }
    th {
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #64748b;
      padding: 12px 8px;
      border-bottom: 2px solid #e2e8f0;
    }
    td {
      padding: 14px 8px;
      font-size: 13px;
      border-bottom: 1px solid #f1f5f9;
      color: #1e293b;
    }
    th.right, td.right { text-align: right; }
    .totals {
      width: 320px;
      margin-left: auto;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 13px;
      color: #475569;
    }
    .totals-row.grand {
      border-top: 2px solid #0f172a;
      margin-top: 8px;
      padding-top: 12px;
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
    }
    .footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .sheet { border: none; box-shadow: none; padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="brand">${organization.name}</div>
        <div class="org-meta">
          ${organization.address || 'Registered SaaS Entity'}<br/>
          ${organization.tax_id ? `Tax ID / GSTIN: ${organization.tax_id}<br/>` : ''}
          Billing Contact: ${organization.billing_email}
        </div>
      </div>
      <div style="text-align: right;">
        <span class="inv-badge">${invoice.status.replace('_', ' ')}</span>
        <div style="font-size: 24px; font-weight: 700; margin-top: 10px; font-family: monospace;">${invoice.invoice_number}</div>
        <div class="org-meta">Issued: ${formatDate(invoice.issue_date)}</div>
        <div class="org-meta">Due Date: ${formatDate(invoice.due_date)}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div>
        <div class="label">Billed To</div>
        <div class="val">${invoice.customer_company || invoice.customer_name || 'Customer'}</div>
        <div class="sub-val">${invoice.customer_email || ''}</div>
        ${invoice.customer_address ? `<div class="sub-val">${invoice.customer_address}</div>` : ''}
        ${invoice.customer_tax_id ? `<div class="sub-val">Tax ID / GSTIN: ${invoice.customer_tax_id}</div>` : ''}
      </div>
      <div style="text-align: right;">
        <div class="label">Payment Summary</div>
        <div class="val">${formatMoneyExact(invoice.total_amount, currency)}</div>
        <div class="sub-val">Currency: ${currency}</div>
        ${invoice.paid_at ? `<div class="sub-val">Paid on: ${formatDate(invoice.paid_at)}</div>` : `<div class="sub-val">Payable by: ${formatDate(invoice.due_date)}</div>`}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="right">Qty</th>
          <th class="right">Unit Price</th>
          <th class="right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${invoice.line_items
          .map(
            (item) => `
        <tr>
          <td><strong>${item.description}</strong></td>
          <td class="right">${item.quantity}</td>
          <td class="right">${formatMoneyExact(item.unit_price, currency)}</td>
          <td class="right">${formatMoneyExact(item.amount, currency)}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>${formatMoneyExact(invoice.subtotal, currency)}</span>
      </div>
      ${
        invoice.discount_amount > 0
          ? `<div class="totals-row">
        <span>Discount</span>
        <span>-${formatMoneyExact(invoice.discount_amount, currency)}</span>
      </div>`
          : ''
      }
      <div class="totals-row">
        <span>Tax (${invoice.tax_rate}%)</span>
        <span>${formatMoneyExact(invoice.tax_amount, currency)}</span>
      </div>
      <div class="totals-row grand">
        <span>Total Amount</span>
        <span>${formatMoneyExact(invoice.total_amount, currency)}</span>
      </div>
    </div>

    ${
      invoice.notes
        ? `<div style="margin-top: 32px; padding: 14px; background: #f8fafc; border-radius: 6px; font-size: 12px; color: #475569;">
      <strong>Notes:</strong> ${invoice.notes}
    </div>`
        : ''
    }

    <div class="footer">
      <span>Generated by Revive Subscription Intelligence Platform</span>
      <span>Invoice Reference: ${invoice.id}</span>
    </div>
  </div>
  ${mode === 'print' ? `<script>window.onload = () => { window.print(); };</script>` : ''}
</body>
</html>`;

  if (mode === 'print') {
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      return;
    }
  }

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${invoice.invoice_number}-${organization.slug || 'revive'}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
