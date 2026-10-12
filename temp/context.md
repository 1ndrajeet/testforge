# TestForge (v1.2) – Complete Project Context

## 1. Executive Summary

**TestForge** is an enterprise-grade examination management platform purpose-built for **MSBTE (Maharashtra State Board of Technical Education)** affiliated polytechnic institutes in Maharashtra, India. It automates the end-to-end semester examination lifecycle—transforming weeks of manual spreadsheet juggling into a streamlined, automated workflow completed in hours.

Key capabilities include:
- Automated parsing of MSBTE timetable HTML and student seating chart Excel sheets.
- Intelligent block (classroom) allocation and seat assignments.
- Automated supervisor and reliever staff assignment.
- MSBTE official report generation (F1 through F22, Attendance Sheets, Packing Slips).
- Question paper (QP) inventory tracking and exam-day reconciliation.
- Exam-day operations: live attendance, absent marking, copy case recording.
- Staff duty order generation and automated email delivery via Resend.
- Multi-tier subscription & billing engine integrated with Razorpay and promo code support.
- Lifetime offline packaging via Docker Compose for air-gapped / on-premise institute deployment.

---

## 2. High-Level Architecture

The project employs a split architecture designed for performance, modularity, and rapid development:

```
                                  ┌────────────────────────┐
                                  │     User / Browser     │
                                  └───────────┬────────────┘
                                              │
                     HTTP / Cookie Auth       │       HTTP / File Uploads
                     Next.js SSR & Actions    │       FastAPI Direct Upload
                                              ▼
                ┌─────────────────────────────────────────────────────────┐
                │                        FRONTEND                         │
                │  Next.js 16 (App Router) + React 19 + TypeScript        │
                │  - Better Auth (Authentication & Sessions)              │
                │  - Drizzle ORM (Database queries & mutations)           │
                │  - Dynamic Module Loader (/exam-center/[...modules])    │
                │  - Zustand Store (Client state & subscription cache)   │
                │  - Tailwind CSS v4 + shadcn/ui                          │
                │  - Resend Email & Razorpay Payment Integrations         │
                └───────────────────┬─────────────────────────────────────┘
                                    │
           Direct DB Access (Drizzle)│ Database Pool (SQLAlchemy)
                                    ▼
                ┌─────────────────────────────────────────────────────────┐
                │                   POSTGRESQL 16                         │
                │  (Dockerized or NeonDB Serverless Free Tier)            │
                │  - 18+ Relational Tables & Composite Indexes            │
                │  - Full MSBTE data models, uploads, logs & billing      │
                └───────────────────▲─────────────────────────────────────┘
                                    │
                                    │ Direct DB Queries & Batch Upserts
                                    │
                ┌───────────────────┴─────────────────────────────────────┐
                │                        BACKEND                          │
                │  FastAPI (Python 3.11) + Uvicorn                        │
                │  - Ultra-fast Excel & HTML file processing              │
                │  - BeautifulSoup4 (Timetable HTML scraping)             │
                │  - Pandas & OpenPyXL (Excel sanitation & parsing)       │
                │  - Session validation against Better Auth endpoint      │
                │  - Batch database operations (Batch size: 250)          │
                └─────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack Breakdown

| Component | Technology | Version / Details | Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | Next.js | 16.2.10 (App Router) | Web application, server-side rendering, API routes |
| **UI Library** | React | 19.2.4 | Modern component architecture |
| **Language** | TypeScript / Python | TS 5.x / Python 3.11 | Type safety across frontend & backend |
| **Styling** | Tailwind CSS & shadcn/ui | Tailwind v4, Radix UI | Curated, responsive dark/light UI |
| **Frontend ORM** | Drizzle ORM | 0.45.2 (`drizzle-kit` 0.31) | Type-safe PostgreSQL queries & migrations |
| **Backend Framework** | FastAPI | 0.136.3 + Uvicorn 0.49 | High-performance file parsing & background ops |
| **Backend DB Access** | SQLAlchemy | 2.0.50 | Raw SQL execution, connection pooling |
| **Database** | PostgreSQL | 16 (Alpine) / NeonDB | Primary persistent relational store |
| **Authentication** | Better Auth | 1.6.16 | Cookie-based session management, Google OAuth |
| **Data Parsing** | Pandas, OpenPyXL, BS4 | Latest | HTML timetable scraping, Excel data sanitization |
| **Payments** | Razorpay | 2.9.6 | Subscriptions, orders, webhooks |
| **Email Service** | Resend | 6.16.0 | Automated supervision order delivery |
| **Containerization** | Docker & Compose | Multi-container | Local development & offline client bundle |

---

## 4. Repository Directory Structure

```text
testforge-v1.2/
│
├── backend/                        # FastAPI Backend Application
│   ├── main.py                     # Entrypoint, CORS, routers, startup/shutdown
│   ├── config.py                   # Environment settings & SQLAlchemy DatabaseManager
│   ├── auth.py                     # BetterAuth session verification helper
│   ├── utils.py                    # File sanitizers (Excel/HTML), validators, helpers
│   ├── schemas.py                  # Pydantic response models
│   ├── requirements.txt            # Python dependencies
│   ├── Dockerfile                  # Container definition for backend
│   └── routers/                    # API endpoints
│       ├── __init__.py             # Router aggregator (/api)
│       ├── upload.py               # Unified file upload & storage (/api/upload)
│       ├── timetable.py            # Timetable HTML parsing (/api/timetable)
│       ├── seatingchart.py         # Seating chart Excel parsing (/api/seatingchart)
│       ├── seatingarrangement.py   # Seating arrangement parsing & mismatch resolution
│       ├── inventory.py            # Question Paper inventory parsing (/api/inventory)
│       └── emarksheet.py           # E-Marksheet parsing (/api/emarksheet)
│
├── frontend/                       # Next.js 16 Fullstack Application
│   ├── package.json                # Node dependencies and scripts
│   ├── drizzle.config.ts           # Drizzle ORM configuration
│   ├── drizzle/                    # Generated SQL migration files
│   ├── public/                     # Static assets (images, icons, templates)
│   └── src/
│       ├── proxy.ts                # Next.js Middleware (auth & onboarding guard)
│       ├── app/                    # Next.js App Router
│       │   ├── page.tsx            # Landing page & feature showcase
│       │   ├── layout.tsx          # Root HTML/body shell & theme provider
│       │   ├── login/              # Login & registration forms
│       │   ├── (authenticated)/    # Authenticated flow (Onboarding)
│       │   ├── (dashboard)/        # Dashboard shell
│       │   │   ├── exam-center/    # Exam center shell & [...modules] catch-all
│       │   │   └── billing/        # Plans, Razorpay payment, promo codes
│       │   └── api/                # Next.js API route handlers (auth, email, webhook)
│       ├── components/             # Reusable UI components & shadcn primitives
│       │   ├── shared/             # FileUploader, Table, Filters, Modals
│       │   └── ui/                 # Button, Dialog, Input, Card, Dropdown, etc.
│       ├── modules/                # Dynamic Page Modules (loaded via [...modules])
│       │   ├── dashboard.tsx       # Exam center home dashboard & KPIs
│       │   ├── exam-setup/         # Timetable, Seating, Blocks, Staff, Center Profile
│       │   ├── block-allocation/   # Auto-allocation engine, supervisor swap, orders
│       │   ├── automation/         # Email duty orders (Supervisors, Relievers, Chief)
│       │   ├── exam-day/           # Live attendance, absent marking, copy cases, QP accounting
│       │   ├── msbte-reports/      # Official MSBTE formats (F1 to F22)
│       │   └── testforge-reports/  # Custom operational reports & printouts
│       ├── lib/
│       │   ├── auth.ts             # Better Auth server configuration & email triggers
│       │   ├── auth-client.ts      # Better Auth client library for React
│       │   ├── session.ts          # Session retrieval, role checks, exam center context
│       │   ├── db/                 # Drizzle instance & complete schema.ts (18+ tables)
│       │   ├── actions2/           # Server actions (allocation, staff, timetable, etc.)
│       │   └── utils.ts            # Formatting, cn() helper, date helpers
│       └── stores/
│           └── appStore.ts         # Zustand persisted client state
│
├── database/                       # Database Dockerfile & setup commands
├── data/                           # Persistent volume directory for Postgres & Uploads
├── client-side/                    # Offline installer scripts (bat/sh/ps1) for institutes
├── docker-compose.yml              # Local/production multi-service orchestration
└── temp/                           # Detailed context documentation directory
```

---

## 5. End-to-End Workflow & Business Logic

```
1. ONBOARDING & SETUP
   Institute Admin Registers ➔ Creates Organization ➔ Configures Exam Center ➔ Activates Trial/Subscription

2. FILE UPLOADS & DATA INGESTION
   Admin uploads files via Frontend FileUploader component:
   ├── Timetable (HTML) ➔ FastAPI parses dates, sessions, subjects, schemes
   ├── Seating Chart (Excel) ➔ FastAPI sanitizes, extracts students, seat numbers, subjects
   ├── Seating Arrangement (Excel) ➔ Cross-checks student-subject mappings; handles mismatches
   ├── QP Inventory (Excel) ➔ Pre-populates expected question paper packets & student counts
   └── E-Marksheet (Excel) ➔ Maps marksheet sheet numbers to paper codes

3. RESOURCE CONFIGURATION
   Admin sets up institute physical & human resources:
   ├── Blocks: Define room numbers, locations, capacity (e.g. 30/40), distribution matrix
   ├── Staff: Add internal & external supervisors, relievers, control room staff

4. BLOCK ALLOCATION ENGINE
   For any selected Exam Date & Session:
   ├── Auto-Allocate: Assigns students to blocks adhering to MSBTE seating rules
   ├── Supervisor Assignment: Allocates available teaching staff to rooms
   └── Reliever Assignment: Assigns roaming relief supervisors per block cluster

5. AUTOMATION & COMMUNICATION
   ├── Generate Supervision Orders with official MSBTE memo format
   └── Automated bulk email dispatch to assigned faculty via Resend API

6. EXAM DAY OPERATIONS
   ├── Morning/Afternoon Desk: Mark absent student seat numbers
   ├── Copy Case Tracking: Record unfair means instances
   └── QP Accounting: Verify received question paper packets vs expected

7. REPORT GENERATION & EXPORT
   Institutes instantly generate & print:
   ├── Official MSBTE Reports: F1 (Supervisor report), F2 (Attendance), ..., F22
   ├── Custom Reports: Block allocation charts, door notices, daily summaries
   └── Packaging Slips: Formatted slips for question paper bundles
```

---

## 6. Security & Authentication Architecture

1. **Authentication Layer (Better Auth)**:
   - Built on top of `better-auth` with PostgreSQL Drizzle adapter.
   - Session tokens stored in HTTP-only `better-auth.session_token` cookies.
   - Middleware in `src/proxy.ts` guards all protected routes, verifies onboarding status, and redirects unauthenticated users to `/login`.
2. **Backend Authentication Bridge**:
   - The FastAPI backend validates incoming requests by reading the `better-auth.session_token` cookie and calling `${APP_URL}/api/auth/get-session`.
   - Once validated, the user ID is resolved against `org_members` and `exam_centers` to inject `exam_center_id` as a FastAPI dependency.
3. **Data Isolation (Multi-Tenancy)**:
   - Every operational table (`students`, `timetable`, `blocks`, `block_allocations`, `staff`, `uploads`, etc.) is strictly keyed by `exam_center_id`.
   - Organizations isolate billing, subscriptions, and memberships (`org_id`).

---

## 7. Context Document Index in `temp/`

For comprehensive, specialized details on individual subsystems, refer to:
- [`backend_context.md`](./backend_context.md): Deep-dive into FastAPI, file sanitizers, parsers, and API contracts.
- [`frontend_context.md`](./frontend_context.md): Deep-dive into Next.js 16, React 19, dynamic module loading, Zustand, Server Actions, and UI components.
- [`database_schema.md`](./database_schema.md): Complete schema reference for all 18+ PostgreSQL tables, relationships, and indexes.
