# Revive — Subscription Management & Revenue Intelligence SaaS

Revive is a full-stack subscription management, billing operations, and AI-assisted revenue intelligence platform built for recurring revenue businesses.

---

## Architecture & Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Recharts, Lucide Icons, Custom Design Token System (Dark & Light Mode)
- **Backend**: Node.js, Express, TypeScript (`tsx`), Zod Input Validation, Express Rate Limit, CORS
- **Database & Security**:
  - **Supabase PostgreSQL, Auth & Cloud Persistence**: Complete SQL schema migration (`supabase/migrations/001_initial_schema.sql`) and seed script (`supabase/seed.sql`) with strict multi-tenant `organization_id` Row Level Security (RLS), live Supabase Auth user synchronization, and Supabase Storage cloud ledger persistence.
  - **Persistent Local Relational Store (`server/store.ts`)**: Automatic local cache/fallback (`server/data/db.Runtime.json`) with one-click Demo Mode reset.
- **Payments (DEMO MODE ONLY)**: Simulated payment engine supporting successful and failed demo payments, simulated invoice settlements, printable PDF tax invoices/receipts, refunds, and ledger reconciliation clearly labeled as **DEMO MODE**.
- **AI Revenue Copilot (Google Gemini API)**: Server-side Google Gemini API integration (`GEMINI_API_KEY`, `GEMINI_MODEL`) grounded in backend-calculated financial metrics, with transparent configuration disclosure and a toggleable Deterministic Analytics Engine.

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

| Service | Environment Variables | Behavior |
| :--- | :--- | :--- |
| **Supabase** | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Connects to live Supabase project (`auth.users` & private cloud storage bucket `revive-ledger-store`) + local relational persistence with strict multi-tenant isolation. |
| **Google Gemini API** | `GEMINI_API_KEY`, `GEMINI_MODEL` | Server-side Google Gemini AI Revenue Copilot grounded in live Revive business data, with Deterministic Analytics Engine fallback. |
| **Payments** | *(None required — DEMO MODE ONLY)* | Strictly simulated payments (`DEMO MODE`) supporting successful settlements, failed bank declines, receipts, and refunds. |
| **Resend Email** | `RESEND_API_KEY`, `EMAIL_FROM` | Logs dunning reminders in the workspace audit trail and notifies when external email delivery is unconfigured. |

---

## Key API Endpoints

- `GET /api/health` — Server health & external integration status (`supabase`, `gemini`, `paymentsMode: 'demo_only'`)
- `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/demo-login`, `POST /api/auth/reset-password`, `GET /api/auth/me`, `PUT /api/auth/profile`
- `POST /api/organizations`, `PUT /api/organizations/:id`, `POST /api/demo/reset`
- `GET /api/analytics/overview?range=7d|30d|90d|12m|custom`
- `GET /api/customers`, `GET /api/customers/:id`, `POST /api/customers`, `PUT /api/customers/:id`, `DELETE /api/customers/:id`
- `GET /api/plans`, `POST /api/plans`, `PUT /api/plans/:id`, `DELETE /api/plans/:id`
- `GET /api/subscriptions`, `POST /api/subscriptions`, `PUT /api/subscriptions/:id`, `POST /api/subscriptions/:id/lifecycle` (`pause`, `resume`, `cancel`, `renew`, `change_plan`)
- `GET /api/invoices`, `GET /api/invoices/:id`, `POST /api/invoices`, `POST /api/invoices/:id/send-reminder`
- `GET /api/payments`, `POST /api/payments/simulate`, `POST /api/payments/:id/refund`, `POST /api/payments/reconcile`
- `POST /api/ai/copilot`
- `POST /api/simulator/calculate`

