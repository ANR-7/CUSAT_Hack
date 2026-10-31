# Revive — Subscription Management & Revenue Intelligence SaaS

Revive is a full-stack subscription management, billing operations, and AI-assisted revenue intelligence platform built for recurring revenue businesses.

---

## Architecture & Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Recharts, Lucide Icons, Custom Design Token System (Dark & Light Mode)
- **Backend**: Node.js, Express, TypeScript (`tsx`), Zod Input Validation, Express Rate Limit, CORS
- **Database & Security**:
  - **Supabase PostgreSQL & Row Level Security (RLS)**: Complete SQL schema migration (`supabase/migrations/001_initial_schema.sql`) and seed script (`supabase/seed.sql`) with strict multi-tenant `organization_id` isolation.
  - **Persistent Local Relational Store (`server/store.ts`)**: Automatic fallback when external Supabase credentials are not configured, persisting all mutations to `server/data/db.Runtime.json` with one-click Demo Mode reset.
- **Payments**: Razorpay Orders & Checkout (Test Mode) with server-side `HMAC-SHA256` signature verification, idempotent webhook processing, refunds, reconciliation, and explicit Demo Mode payment simulation.
- **AI Revenue Copilot**: Server-side OpenAI API integration (`gpt-4o-mini`) grounded in backend-calculated financial metrics, with transparent configuration disclosure and a toggleable Deterministic Analytics Engine when `OPENAI_API_KEY` is not set.

---

## Local Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

> **Zero-Config Demo Mode**: Even before adding external API keys, Revive runs out-of-the-box using its persistent local database and explicit Demo Mode indicators.

### 3. Start Backend & Frontend Concurrently

```bash
npm run dev
```

- **Frontend UI**: `http://localhost:5173`
- **Backend API**: `http://localhost:4000` (proxied automatically via `/api` on port `5173`)

### 4. Run Automated Tests & Production Build

```bash
npm test
npm run build
```

---

## Demo Account & Multi-Tenant Testing

- **Default Demo Account**:
  - **Email**: `aditya@brightloop.io`
  - **Password**: `ReviveDemo#2026`
  - **Organization**: `Brightloop Software` (`INR`)
- **Second Isolated Tenant Account (for testing multi-tenant isolation)**:
  - **Email**: `meera@apexcloud.io`
  - **Password**: `ApexSecret#2026`
  - **Organization**: `Apex Cloud Systems` (`USD`)
- You can also click **"Launch Demo"** on the login page, register a new account, or create additional organizations from the sidebar Organization Switcher.

---

## External Service Credentials (`.env`)

| Service | Environment Variables | Behavior When Unconfigured |
| :--- | :--- | :--- |
| **Supabase** | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Uses persistent local relational database (`server/data/db.Runtime.json`) with full multi-tenant isolation. |
| **OpenAI API** | `OPENAI_API_KEY`, `OPENAI_MODEL` | Displays a clear configuration notice in the AI Copilot and allows toggling the Deterministic Backend Analytics Engine. |
| **Razorpay** | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Enables HMAC-SHA256 verification with test secret and provides an explicit Demo Payment Simulator modal. |
| **Resend Email** | `RESEND_API_KEY`, `EMAIL_FROM` | Logs dunning reminders in the workspace audit trail and notifies that external email delivery is unconfigured. |

---

## Key API Endpoints

- `GET /api/health` — Server health & external integration status
- `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/demo-login`, `POST /api/auth/reset-password`, `GET /api/auth/me`, `PUT /api/auth/profile`
- `POST /api/organizations`, `PUT /api/organizations/:id`, `POST /api/demo/reset`
- `GET /api/analytics/overview?range=7d|30d|90d|12m|custom`
- `GET /api/customers`, `GET /api/customers/:id`, `POST /api/customers`, `PUT /api/customers/:id`, `DELETE /api/customers/:id`
- `GET /api/plans`, `POST /api/plans`, `PUT /api/plans/:id`, `DELETE /api/plans/:id`
- `GET /api/subscriptions`, `POST /api/subscriptions`, `PUT /api/subscriptions/:id`, `POST /api/subscriptions/:id/lifecycle` (`pause`, `resume`, `cancel`, `renew`, `change_plan`)
- `GET /api/invoices`, `GET /api/invoices/:id`, `POST /api/invoices`, `POST /api/invoices/:id/send-reminder`
- `GET /api/payments`, `POST /api/payments/razorpay/create-order`, `POST /api/payments/razorpay/verify`, `POST /api/payments/simulate`, `POST /api/payments/:id/refund`, `POST /api/payments/reconcile`
- `POST /api/webhooks/razorpay`
- `POST /api/ai/copilot`
- `POST /api/simulator/calculate`

