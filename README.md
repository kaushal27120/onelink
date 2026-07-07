# OneLink

**All-in-one operations platform for hospitality & F&B businesses.**  
Manage revenue, food cost, HR, schedules, inventory, and AI-powered insights — from a single dashboard.

---

## What is OneLink?

OneLink is a SaaS platform built for restaurants, hotels, canteens, beauty salons, pharmacies, gas stations, gyms, and car workshops. It replaces scattered spreadsheets, separate HR tools, and monthly accountant meetings with one real-time operations hub — with AI Directors that alert you before a problem becomes a loss.

---

## Features

### Finance & P&L
- Daily revenue entry with multi-location comparison
- Real-time food cost % tracking and EBIT calculation
- Excel revenue import (supports DD.MM.YYYY, merged columns, Polish number formatting, `#VALUE!` errors)
- Monthly P&L PDF generator — one-click ready for your accountant
- Budget planning and what-if scenario analysis

### AI Directors
- **CFO Director AI** — analyses P&L, detects food cost anomalies, answers "why did cost rise?"
- **COO Director AI** — monitors attendance, spots schedule gaps, flags overtime
- **Sales Director AI** — revenue trend analysis and demand forecasting
- **Investor Director AI** — business performance summaries and ROI reporting
- **AI Week Planner** — 7-day predictive revenue forecast with staffing and ordering recommendations
- **Grafik AI** — auto-generates a full weekly staff schedule from operating hours, availability, and labour cost target
- **Supplier Negotiator AI** — analyses 6-month purchase history and drafts negotiation emails

### HR & Scheduling
- Employee management with role-based access and position colours
- Weekly/monthly schedule grid with draft → publish flow
- Open shifts ("Zmiany do wzięcia") — employees claim available shifts from their app
- Attendance tracking with clock-in/clock-out, night hours, overtime detection
- Leave requests and approval workflow
- Shift swap requests between employees
- Multi-day availability calendar for employees
- Payroll calculator from clock-in records — Excel export for accountant
- Employee onboarding flow

### Inventory & Kitchen
- Product and ingredient management with units and categories
- Dish recipes with food cost per recipe calculation
- HACCP temperature log
- Inventory jobs — daily, weekly, monthly stock counts
- Invoice scanning with AI OCR
- KSeF (Polish e-invoice) inbox integration
- Central warehouse and inter-location stock transfers

### Kiosk & Employee App
- PIN-based clock-in/clock-out kiosk (works on any tablet)
- QR-code employee login
- Employee personal schedule, attendance history, leave requests, shift swaps
- Push notifications for new shifts, schedule changes, alerts

### Operations
- Multi-location management from one admin panel
- Real-time Live TV Dashboard — full-screen view of today's sales, clocked-in staff, and active alerts
- Checklist management for daily operational tasks
- Handover notes between shifts
- Cash audit log
- Allergen register
- Alerts and notifications system
- Role-based permissions per user

### Reporting & Exports
- PDF and Excel exports across all modules
- Attendance records with night-rate and equivalent calculations
- Food cost reports per location and period
- SEMIS cost category breakdown

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + Radix UI |
| Database & Auth | Supabase (PostgreSQL + Row Level Security) |
| AI | Anthropic Claude (`@anthropic-ai/sdk`) + OpenAI |
| Payments | Stripe |
| Animations | Framer Motion |
| Charts | Recharts |
| Excel | SheetJS (`xlsx`) |
| PDF parsing | PDF.js |
| Push notifications | Web Push API |
| Icons | Lucide React |

---

## Project Structure

```
onelink/
├── app/
│   ├── admin/          # Owner/manager dashboard
│   ├── employee/       # Employee-facing app
│   ├── ops/            # Operations manager view
│   ├── kiosk/          # PIN clock-in kiosk
│   ├── finance/        # Finance module
│   ├── ai/             # AI Directors
│   ├── billing/        # Stripe subscription management
│   ├── api/            # API routes (AI, clock, push, webhooks…)
│   ├── dla-restauracji/  # Industry landing — restaurants
│   ├── dla-hoteli/       # Industry landing — hotels
│   ├── dla-salonow-beauty/ # Industry landing — beauty salons
│   └── …               # Other industry and public pages
├── components/
│   ├── schedule-grid.tsx   # Weekly/monthly schedule grid
│   ├── hr-views.tsx        # Attendance, leave, swaps
│   ├── employees-manager.tsx
│   ├── food-cost-dashboard.tsx
│   ├── ai-auto-schedule.tsx
│   ├── ai-week-planner.tsx
│   └── …
└── lib/                # Shared utilities, i18n, holidays
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project
- Stripe account (for billing)
- Anthropic API key
- OpenAI API key

### Installation

```bash
git clone https://github.com/kaushal27120/onelink.git
cd onelink
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

ANTHROPIC_API_KEY=your_anthropic_api_key
OPENAI_API_KEY=your_openai_api_key

STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key

NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
```

### Database Setup

Run the following in your Supabase SQL Editor:

```sql
-- Position colours (schedule grid)
CREATE TABLE IF NOT EXISTS position_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position_name TEXT NOT NULL,
  color_hex TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, position_name)
);
ALTER TABLE position_colors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "position_colors_owner" ON position_colors
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Open / available shifts
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_open_shift BOOLEAN DEFAULT FALSE;
```

> The full schema (employees, shifts, invoices, inventory, leave_requests, etc.) is managed via Supabase migrations. Contact the team for the complete migration file.

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment

The project is optimised for [Vercel](https://vercel.com). Push to your main branch and Vercel will build and deploy automatically. Make sure all environment variables are set in the Vercel dashboard.

```bash
npm run build   # verify build locally before pushing
```

---

## Supported Industries

OneLink ships industry-specific landing pages and configuration for:

- Restaurants & canteens
- Hotels
- Beauty salons & spas
- Pharmacies
- Petrol / gas stations
- Gyms & fitness clubs
- Retail shops
- Car workshops

---

## Pricing

| Plan | Best for |
|---|---|
| **Start** | Single location, small team |
| **Growth** | Growing business, full HR + AI |
| **Network** | Multi-location operations |
| **Enterprise** | Large chains — custom SLA & integrations |

See [onelink.pl/pricing](https://onelink.pl/pricing) for current rates.

---

## Languages

The platform is fully bilingual — **Polish** and **English** — with automatic detection and a manual switcher.

---

## License

Private — all rights reserved. Not open source.
