# TestForge (v1.2) – Frontend Context & Architecture

## 1. Overview & Purpose

The **TestForge Frontend** is a full-featured examination management web application built on **Next.js 16 (App Router)** and **React 19**. It serves as the primary user interface for institute administrators, examination controllers, and staff.

Key architectural features include:
- **Server Actions & Direct ORM**: High-speed database interactions via Drizzle ORM and Next.js Server Actions.
- **Dynamic Module Loader**: A catch-all route (`/exam-center/[...modules]`) that dynamically loads domain modules on-demand with subscription gating.
- **Better Auth Integration**: Secure cookie-based authentication with session sharing between Next.js and FastAPI.
- **MSBTE Report Rendering**: High-fidelity, print-ready MSBTE official documents (F1–F22) with automatic pagination and headers via `react-to-print`.
- **Intelligent Block Allocation UI**: Interactive seat allocation and supervisor assignment workspace.

---

## 2. Technical Stack & Dependencies

- **Framework**: Next.js `16.2.10` (App Router, Turbopack / Webpack)
- **UI & State**: React `19.2.4`, React DOM `19.2.4`, Zustand `5.0.14`
- **Language**: TypeScript `5.x`
- **Database & ORM**: Drizzle ORM `0.45.2`, `drizzle-kit` `0.31.10`, `pg` `8.21.0`
- **Authentication**: Better Auth `1.6.16` with Drizzle adapter
- **Styling**: Tailwind CSS `v4`, `tw-animate-css`, `clsx`, `tailwind-merge`
- **Component Primitives**: Radix UI, shadcn/ui, Lucide React (`1.17.0`)
- **Print & Export**: `react-to-print` (`3.3.0`), `xlsx` (`0.18.5`)
- **Animations & Visuals**: Framer Motion (`12.40.0`), Chart.js (`4.5.1`), `react-chartjs-2`
- **Email Service**: Resend (`6.16.0`)
- **Payment Gateway**: Razorpay (`2.9.6`)
- **Form & Validation**: Zod (`4.4.3`), `react-dropzone` (`15.0.0`)

---

## 3. Directory Structure

```text
frontend/src/
├── proxy.ts                    # Next.js Middleware (auth & onboarding router)
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root HTML layout, font setup, theme provider
│   ├── page.tsx                # Landing page & feature showcase (49KB)
│   ├── globals.css             # Tailwind CSS tokens, theme variables
│   ├── login/                  # User login & registration
│   ├── auth/                   # Auth callbacks & error states
│   ├── (authenticated)/
│   │   └── onboarding/         # Organization & Exam Center onboarding flow
│   ├── (dashboard)/
│   │   ├── layout.tsx          # Dashboard sidebar, navbar, exam center selector
│   │   ├── billing/            # Subscription plans, Razorpay checkout, promo codes
│   │   └── exam-center/
│   │       └── [...modules]/   # Dynamic catch-all module loader
│   └── api/                    # Route Handlers
│       ├── auth/[...all]/      # Better Auth API endpoints
│       ├── health/             # Health check endpoint
│       ├── payments/webhook/   # Razorpay webhook listener
│       └── send-email/         # Resend email dispatcher
├── components/
│   ├── ui/                     # shadcn/ui primitives (button, dialog, input, etc.)
│   ├── shared/                 # Shared components (FileUploader, Table, Filters)
│   └── navigation/             # App sidebar, breadcrumbs, user dropdown
├── modules/                    # Pluggable feature modules (lazy-loaded)
│   ├── dashboard.tsx           # Main Exam Center Dashboard
│   ├── exam-setup/             # Setup: Timetable, Seating, Blocks, Staff, Center Profile
│   ├── block-allocation/       # Allocation: Auto-allocate, Swap supervisor, Orders
│   ├── automation/             # Automation: Email duty orders (Supervisors/Relievers)
│   ├── exam-day/               # Exam Day: Attendance, Absentees, Copy Cases, QP Accounting
│   ├── msbte-reports/          # F1 to F22 official MSBTE print formats
│   ├── testforge-reports/      # Custom institute reports (Daily Summary, Packaging Slips)
│   └── settings/               # Center & organization settings
├── lib/
│   ├── auth.ts                 # Better Auth server configuration
│   ├── auth-client.ts          # Better Auth client instance
│   ├── session.ts              # Session caching, getExamCenterId, requireAdmin
│   ├── db/
│   │   ├── index.ts            # Drizzle client instance (Pool with pg)
│   │   └── schema.ts           # Complete database schema definitions (18+ tables)
│   ├── actions2/               # Server Actions (Allocation, Timetable, Staff, etc.)
│   ├── misc/logger.ts          # Structured application logger
│   └── utils.ts                # Formatting, classnames helper (cn), date utilities
└── stores/
    └── appStore.ts             # Zustand persisted client store (User, Org, Center)
```

---

## 4. Routing & Middleware Architecture

### 4.1 Route Guard (`src/proxy.ts`)
Acts as the central security and onboarding gatekeeper:
1. **Public Routes**: Bypasses `/login`, `/register`, `/api/auth`, `/`, `/pricing`, `/api/health`, and static assets (`_next`, `favicon.ico`).
2. **Session Verification**: Uses `getSessionCookie(request)` from Better Auth. Redirects to `/login?callbackUrl=...` if no session exists.
3. **Onboarding Verification**:
   - Checks the `onboarding_complete` cookie.
   - If missing, queries `getOnboardingStatus()`:
     - `needs_organization` $\rightarrow$ redirects to `/onboarding?step=organization`
     - `needs_exam_setup` $\rightarrow$ redirects to `/onboarding?step=exam_center`
     - `needs_subscription` $\rightarrow$ redirects to `/onboarding?step=subscription`
     - `complete` $\rightarrow$ sets `onboarding_complete=true` cookie (valid for 30 days) and proceeds.

### 4.2 Dynamic Module Catch-All (`app/(dashboard)/exam-center/[...modules]/page.tsx`)
Instead of duplicating route folders, all exam center features are mapped dynamically:
- **URL Pattern**: `/exam-center/<module-category>/<module-name>`
  - Examples:
    - `/exam-center/dashboard` $\rightarrow$ imports `@/modules/dashboard.tsx`
    - `/exam-center/exam-setup/timetable` $\rightarrow$ imports `@/modules/exam-setup/timetable.tsx`
    - `/exam-center/block-allocation/allocate` $\rightarrow$ imports `@/modules/block-allocation/allocate.tsx`
    - `/exam-center/msbte-reports/f1` $\rightarrow$ imports `@/modules/msbte-reports/f1.tsx`
- **Subscription Verification**:
  - Checks subscription status against `getCurrentSubscription()`.
  - Caches status in-memory for 5 minutes (`CACHE_DURATION = 5 * 60 * 1000`).
  - If subscription is `inactive` or expired, redirects automatically to `/billing`.
- **Dynamic Import with Suspense/Transition**:
  - Uses `React.useTransition` and dynamic `import(@/modules/${modulePath})`.
  - Renders `<HashLoader color="#059669" />` during chunk loading.
  - Displays a recovery UI with retry and dashboard navigation if a module fails to load.

---

## 5. Domain Modules Breakdown

### 5.1 `modules/exam-setup/`
1. **`center-profile.tsx`**: Exam center details (Code, Name, Officer In-Charge, Dist Center, Exam Controller, Sealing Supervisor, Departments).
2. **`timetable.tsx`**:
   - Displays timetable table with date filters, morning/afternoon session toggles, subject codes, schemes, and student counts.
   - Integrates `FileUploader` for timetable HTML files.
3. **`seating-chart.tsx`**:
   - Institute-wise seating chart management.
   - Allows selecting connected institutes and uploading their respective seating charts.
   - Displays student counts and processed schemes per institute.
4. **`seating-arrangement.tsx`**:
   - Uploads MSBTE seating arrangement Excel files.
   - Includes modal for resolving student-paper mismatches.
5. **`supervisors.tsx`**:
   - Management of internal and external faculty for examination duty.
   - Tracks UID, Name, Department, Email, Role, Designation, and Examination Post.
6. **`relievers.tsx` & `control-room.tsx`**:
   - Reliever faculty assignment (roaming staff during exams).
   - Control room staff assignment.
7. **`block.tsx`**:
   - Block (classroom) configuration: Block No, Location/Room, Strength (Capacity: e.g. 30, 40), and distribution matrix (e.g. `[10, 10, 10, 10]`).
8. **`qp-inventory.tsx`**:
   - Question paper inventory tracking: Date, Session, Subject Code, Expected Students, Expected Packets, Received Packets.
9. **`emarksheet.tsx`**:
   - E-Marksheet management: Sheet No, Subject Name, Scheme, Head, Paper Code, File Name.

### 5.2 `modules/block-allocation/`
1. **`allocate.tsx` (Core Engine UI)**:
   - Date & session selector.
   - Displays available blocks and student lists for the day.
   - **Auto-Allocate Trigger**: Runs the allocation algorithm to distribute students across blocks while preventing adjacent seats of the same subject.
   - Assigns teaching staff as block supervisors.
   - Interactive table showing block number, capacity, assigned count, first seat, last seat, subject code, and assigned supervisor.
2. **`change-supervisor.tsx`**:
   - Rapid swapping and re-assignment of supervisors when faculty members report absent on exam day.
3. **`clear-allocation.tsx`**:
   - Safely wipes allocations for a specific date, session, or entire center to allow re-allocation.
4. **`supervision-order.tsx`**:
   - Generates official appointment memos/orders for supervisors.

### 5.3 `modules/automation/`
1. **`office-order-mail.tsx`**:
   - Bulk email center powered by Resend API.
   - Allows selecting exam dates and sessions, previewing customized email templates with duty details, and dispatching emails to staff in one click.
   - Displays real-time email delivery logs (`email_logs`).
2. **`supervision-order.tsx`**, **`chief-order.tsx`**, **`reliever-order.tsx`**:
   - Official memorandum generation and email dispatch for specific staff roles.

### 5.4 `modules/exam-day/`
1. **`absent.tsx`**:
   - Quick absentee recording interface for morning and afternoon sessions.
   - Updates `absent_numbers` in `timetable` and recalculates attendance statistics.
2. **`copy-case.tsx`**:
   - Records unfair means (malpractice/copy cases) with student seat numbers, paper codes, and supervisor statements.
3. **`qp-accounting.tsx`**:
   - Real-time reconciliation of opened question paper packets, used papers, and returned unused papers.

### 5.5 `modules/msbte-reports/` (F1 to F22)
Implements pixel-perfect, printable official MSBTE examination forms:
- **`f1.tsx`**: Form 1 – Supervisor's Report
- **`f2.tsx`**: Form 2 – Candidate Attendance Sheet
- **`f3.tsx` & `f3a.tsx`**: Form 3/3A – Seating Statement
- **`f4.tsx` - `f22.tsx`**: Packing slips, question paper opening certificates, sealing certificates, reliever reports, bill forms, and control room statements.
- All forms utilize `react-to-print` for direct browser printing without header/footer distortion.

### 5.6 `modules/testforge-reports/`
Custom operational documents:
- `daily-summary.tsx`: Daily overview of students, blocks, and supervisors.
- `block-allocation.tsx`: Classroom door allocation notices.
- `staff-duty.tsx`: Master duty roster for institute notice boards.
- `qp-summary.tsx`: Question paper packet accounting summary.
- `blank-absent.tsx` & `blank-reliever.tsx`: Offline emergency forms.

---

## 6. Server Actions & Backend Communication

The frontend interacts with data in two primary ways:

### 6.1 Server Actions (`src/lib/actions2/`)
- **`session.ts`**:
  - `getSession()`: Cached wrapper over `auth.api.getSession`.
  - `getExamCenterId()`: Resolves the active exam center ID for the logged-in user.
  - `requireExamCenter()`: Throws an unauthorized error if no active center exists.
- **`allocation.ts`**:
  - `autoAllocate(date, session)`: Executes the intelligent block allocation algorithm.
  - `getAllocations(params)`: Retrieves block allocations with filtering.
  - `assignSupervisor(allocationId, supervisorUid)`: Updates supervisor for a block.
  - `clearAllocations(params)`: Clears allocations.
  - `getPackingSlips(date, session)`: Generates packing slip data models.
  - `getSupervisionReport(date, session)`: Aggregates data for Form 1.
- **`timetable.ts`**, **`student.ts`**, **`staff.ts`**, **`block.ts`**, **`inventory.ts`**, **`emarksheet.ts`**:
  - Full CRUD operations executing directly against PostgreSQL via Drizzle ORM.

### 6.2 FastAPI Communication (`components/shared/file-uploader.tsx`)
- Large file uploads bypass Next.js API routes and go directly to FastAPI:
  - `POST ${BACKEND_URL}/api/upload/` (multipart form data).
  - Sends `better-auth.session_token` cookie for backend verification.
  - After upload succeeds, triggers the appropriate processing endpoint:
    - `${BACKEND_URL}/api/timetable/process`
    - `${BACKEND_URL}/api/seatingchart/process`
    - `${BACKEND_URL}/api/seatingarrangement/process`
    - `${BACKEND_URL}/api/inventory/process`
    - `${BACKEND_URL}/api/emarksheet/process`

---

## 7. Client State Management (`src/stores/appStore.ts`)

Zustand is used for persistent client state management:
- **Stored Entities**: `user`, `organization`, `examCenter`, `recentPayment`, `onboardingComplete`.
- **Persistence**: Backed by `localStorage` under key `testforge-storage`.
- **Helper Functions**:
  - `hasActiveSubscription()`: Validates whether `subscriptionExpiresAt > now` and tier is `premium`, `enterprise`, or valid `trial`.
  - `isTrialActive()`: Checks if current tier is `trial` and not expired.
  - `getDaysRemaining()`: Calculates remaining subscription days.
  - `needsPayment()`: Returns `true` if subscription is inactive or expired.
  - `logout()`: Clears store and deletes auth/onboarding cookies.
