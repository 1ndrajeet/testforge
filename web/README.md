# TestForge v1.2 — Next.js 16 + Supabase

A standalone **Next.js 16** application communicating directly with **Supabase**
(Auth, Postgres with Row-Level Security, and Storage).

Replaces the legacy architecture (Better Auth + Drizzle ORM + FastAPI parser
service) with an in-app TypeScript architecture that maintains 100% UI and
functional parity.

---

## Key Architecture Principles

1. **Self-Contained Modules**:
   - Every module under `src/modules/**` owns its own data access (`actions.ts`
     for mutations, `queries.ts` for reads).
   - **Zero cross-module imports**: `modules/A` never imports from `modules/B`.
   - No shared `actions2/` or `actions/` layer.
2. **Direct Supabase Integration**:
   - **Auth**: Supabase Auth (`@supabase/ssr`) with cookie-based session
     management.
   - **Database**: PostgreSQL with Row-Level Security (RLS) policies scoped to
     `exam_center_id` and user ownership.
   - **Storage**: Supabase Storage bucket `documents` for PDF/Excel file
     uploads.
3. **In-App TypeScript Parsers**:
   - Timetable (`timetable.ts`), Seating Chart (`seatingchart.ts`), Seating
     Arrangement (`seatingarrangement.ts`), QP Inventory (`inventory.ts`), and
     E-Marksheet (`emarksheet.ts`) located in `src/lib/parsers/`.
   - Completely eliminates the Python/FastAPI backend dependency.

---

## Directory Structure

```
web/
├── src/
│   ├── app/                               # Next.js 16 App Router
│   │   ├── (authenticated)/               # Authenticated pages (onboarding)
│   │   ├── (dashboard)/                   # Dashboard pages (billing, exam-center)
│   │   ├── api/                           # API route handlers
│   │   │   ├── health/                    # Health check
│   │   │   ├── payments/checkout/         # Razorpay checkout & subscription activation
│   │   │   ├── payments/history/          # Payment transaction history
│   │   │   ├── send-email/                # Email notification endpoint (Resend)
│   │   │   ├── upload/[fileType]/         # File upload & parsing endpoint
│   │   │   └── user/status/               # Session & center status
│   │   ├── auth/callback/                 # OAuth callback handler
│   │   ├── login/                         # Authentication & login
│   │   ├── globals.css                    # Tailwind CSS v4 & theme variables
│   │   └── proxy.ts                       # Next.js route proxy & auth guard
│   ├── components/                        # UI and shared components
│   │   ├── admin/                         # Admin dashboard widgets
│   │   ├── layout/                        # App header, sidebar, navigation
│   │   ├── shared/                        # File uploader, modals, helpers
│   │   └── ui/                            # Shadcn UI primitives
│   ├── config/                            # Course codes, institute mappings, pricing
│   ├── hooks/                             # Custom React hooks (useUserInfo, useSidebar, etc.)
│   ├── lib/
│   │   ├── parsers/                       # In-app file parsing logic
│   │   ├── supabase/                      # Client, server, and middleware Supabase clients
│   │   ├── auth.ts & auth-client.ts       # Auth helpers & client adapter
│   │   ├── session.ts                     # User & exam center session resolution
│   │   └── types.ts                       # Shared TypeScript definitions
│   ├── modules/                           # Self-contained domain modules
│   │   ├── admin/                         # System administration & center management
│   │   ├── automation/                    # Automated supervisor allocation & notifications
│   │   ├── block-allocation/              # Exam room & supervisor allocation
│   │   ├── dashboard/                     # Exam center analytics dashboard
│   │   ├── exam-day/                      # Attendance, QP accounting, copy cases
│   │   ├── exam-setup/                    # Blocks, staff, timetable, seating, inventory
│   │   ├── msbte-reports/                 # MSBTE official exam reports (F1–F22)
│   │   ├── settings/                      # Profile, password, billing, center profile
│   │   └── testforge-reports/             # Custom institution exam reports
│   └── stores/                            # Global Zustand stores (appStore)
├── supabase/
│   └── migrations/
│       ├── 0001_init.sql                  # PostgreSQL schema, RLS policies, storage bucket
│       └── seed.sql                       # Seed data for development
├── package.json
└── tsconfig.json
```

---

## Getting Started

### 1. Prerequisites

- **Node.js**: >= 18.17.0
- **pnpm**: >= 9.x
- **Supabase Account / CLI**: Local or hosted Supabase project

### 2. Environment Variables

Create `.env.local` in `web/` with the following variables:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Razorpay (Payments)
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-key-secret

# Resend (Emails)
RESEND_API_KEY=your-resend-api-key
RESEND_FROM_EMAIL=onboarding@testforge.in

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Database Setup

Apply the database migration to your Supabase PostgreSQL instance:

```bash
# Using Supabase CLI
supabase db push

# Or run the SQL script directly in the Supabase SQL Editor:
# web/supabase/migrations/0001_init.sql
```

### 4. Install Dependencies & Run

```bash
cd web
pnpm install
pnpm dev
```

Visit `http://localhost:3000`.

---

## Verification & Quality Assurance

### Type Checking

```bash
pnpm tsc --noEmit
```

_(Guaranteed 0 TypeScript errors)_

### Production Build

```bash
pnpm build
```

_(Compiles and optimizes all 14 routes statically and dynamically)_
