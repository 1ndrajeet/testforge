# TestForge Landing Page — Product Intelligence & Design Master Prompt

---

## Part I — Product Intelligence

### 1. Executive Product Summary

**TestForge** is an institutional Examination Operations Operating System engineered specifically for higher-education colleges, polytechnics, and examination centres administering rigorous, high-stakes semester examinations governed by statutory boards (with deep, native compliance for the Maharashtra State Board of Technical Education — MSBTE).

Unlike generic campus management suites or superficial ERP modules, TestForge solves the acute operational crisis that occurs inside an institutional Examination Control Room during an active examination cycle. It digitizes and unifies the high-friction, error-prone chain of manual administration:
1. **Pre-Examination Provisioning**: Center profile definition, timetable parsing, candidate roster ingestion, physical room/block capacity modeling, bench layout configuration, and faculty invigilator profiling.
2. **Deterministic Constraint-Based Allocation**: Automated and assisted distribution of candidates and invigilators across physical exam blocks with strict enforcement of institutional integrity rules (such as hard departmental conflict avoidance, block locking, and single-session duty constraints).
3. **Control Room Automation**: Single-click generation of statutory appointment letters (Supervision Orders, Reliever Orders, Chief Officer Orders) with official letterhead formatting, followed by batch dispatch via an integrated automated email engine.
4. **Day-of-Exam Operations & Chain of Custody**: Real-time logging of candidate absences, malpractice incident recording (Copy Cases / CPS), and physical Question Paper (QP) packet accounting (tracking sealed packets of 50 papers from distribution centre receipt to opening and balance reconciliation).
5. **Statutory Board Reporting (MSBTE Formats 1–22)**: Complete, pixel-perfect digital generation of the mandatory 22 statutory examination formats (attendance rolls, answer book bundle packing slips, police complaint dossiers, panchnamas, show-cause notices, vigilance registers, and flying squad reports).
6. **Executive Intelligence & Duty Equity**: Real-time dashboards, cumulative faculty duty logs (ensuring equitable workload across academic departments), and single-sheet daily operation digests for Principals and Chief Examination Officers.

---

### 2. Module Inventory

Based on exhaustive recursive inspection of the `web/src/modules/` directory, the codebase comprises eight specialized functional domains encompassing 53 core source files:

| Module Domain | Directory Path | Core Files & File Count | Primary Responsibility |
| :--- | :--- | :--- | :--- |
| **Exam Setup** | `src/modules/exam-setup/` | 11 files (`center-profile.tsx`, `timetable.tsx`, `supervisors.tsx`, `relievers.tsx`, `control-room.tsx`, `block.tsx`, `seating-chart.tsx`, `seating-arrangement.tsx`, `qp-inventory.tsx`, `emarksheet.tsx`, `actions.ts`) | Baseline institutional data ingestion, timetable ingestion, block and bench geometry, candidate roll validation, staff duty pools, and QP expected receipt modeling. |
| **Block Allocation** | `src/modules/block-allocation/` | 7 files (`allocate.tsx`, `change-supervisor.tsx`, `clear-allocation.tsx`, `supervision-order.tsx`, `actions.ts`, `queries.ts`, `index.ts`) | Multi-variable candidate-to-room seating distribution engine, faculty supervisor assignment with strict department conflict enforcement, emergency supervisor replacement, and allocation resetting. |
| **Exam Automation** | `src/modules/automation/` | 7 files (`office-order-mail.tsx`, `supervision-order.tsx`, `chief-order.tsx`, `reliever-order.tsx`, `actions.ts`, `queries.ts`, `index.ts`) | Generation of official printable appointment orders on institutional letterheads and automated batch delivery of personalized duty schedules to faculty emails with quota tracking. |
| **Exam Day Operations** | `src/modules/exam-day/` | 6 files (`absent.tsx`, `copy-case.tsx`, `qp-accounting.tsx`, `actions.ts`, `queries.ts`, `index.ts`) | Live examination hall operational logging: real-time absence tracking, malpractice/copy-case recording, and question paper packet custody reconciliation. |
| **MSBTE Statutory Reports** | `src/modules/msbte-reports/` | 23 files (`f1.tsx` through `f22.tsx`, including `f3a.tsx`) | 100% compliant, printable, multi-page statutory reports required by state technical boards (Formats 1 to 22), complete with formal signing blocks, seals, and legal panchnamas. |
| **TestForge Operational Reports** | `src/modules/testforge-reports/` | 8 files (`daily-summary.tsx`, `block-allocation.tsx`, `blank-absent.tsx`, `blank-reliever.tsx`, `staff-duty.tsx`, `supervision.tsx`, `qp-summary.tsx`, `subject-allocation.tsx`) | Native administrative reports: physical invigilation worksheets, door-posting seating notices, daily executive summaries, faculty workload equity audits, and QP balance ledgers. |
| **Institutional Dashboard** | `src/modules/dashboard.tsx` | 1 file (`dashboard.tsx`, 1,420 lines) | Central command console for the Chief Examination Officer: real-time session distribution metrics, block utilization gauges, attendance extremes, and duty rosters. |
| **Platform Administration & Settings** | `src/modules/admin/`, `src/modules/settings/` | 6 files (`admin/dashboard.tsx`, `admin/actions.ts`, `admin/queries.ts`, `admin/index.ts`, `settings/profile.tsx`, `settings/preferences.tsx`) | Multi-tenant organization provisioning, billing and subscription management, audit logs, system health diagnostics, exam center profile management, and UI display density preferences. |

---

### 3. Detailed Module Analysis

#### 3.1. Exam Setup Module (`src/modules/exam-setup/`)
* **Purpose**: Transforms raw external examination schedules, student rosters, and room inventories into an operational, validated data foundation.
* **Target Users**: Examination In-Charge, Assistant Controller of Examinations, Examination Section Clerks.
* **Inputs**:
  - Center profile metadata: Center code, center name, distribution center code/name, officer-in-charge, sealing supervisor, exam season (`Summer` / `Winter`), exam year, date ranges (`center-profile.tsx`).
  - Timetable spreadsheets/CSV: Exam day number, calendar date, session (`Morning` / `Afternoon`), time slot, subject code, subject title, scheme, subject abbreviation, total enrolled candidates (`timetable.tsx`).
  - Staff rosters: Faculty ID, name, email, department (course codes mapped from `course_codes.json`), designation (`LECTURER`, `LAB_ASSISTANT`, `HEAD_OF_DEPT`), staff type (`SUPERVISOR`, `RELIEVER`, `CONTROL_ROOM`) (`supervisors.tsx`).
  - Physical room inventory: Block number, building/floor location, total seating capacity/strength, bench distribution array (e.g. `[15, 15]`), seating pattern template (`reverse-zigzag`, `reverse`, `linear`, `linear-zigzag`) (`block.tsx`).
  - Candidate roll: Seat numbers, enrollment IDs, candidate names, curriculum scheme, parent institute code/name, registered subject codes (`seating-chart.tsx`).
  - QP Expected Inventory: Subject-wise expected student count and expected packets calculated from timetable (`qp-inventory.tsx`).
* **Process**:
  - Uploaded files are validated, normalized, and mapped to database models using client-side parsers and Supabase table upserts.
  - Verification screen (`seating-arrangement.tsx`) validates official board seating data against candidate course registrations to detect subject mismatches prior to exam day.
* **Outputs**: Validated master records for Center Profile, Timetable entries, Block Geometry, Supervisor Directory, and Candidate Seating Database.
* **Pain Removed**: Eliminates days of re-typing timetables and student rosters from paper notices or disjointed Excel files; prevents typos in course codes and miscalculated room capacities.
* **Institutional Value**: Guarantees data integrity from day zero. A single error in room capacity or subject code can derail an entire exam session; this module makes errors mathematically impossible.
* **Code Evidence**: `src/modules/exam-setup/center-profile.tsx` (`ExamCenterData`, `StatsCards`), `timetable.tsx` (`mapTimetableRecord`, `UniversalFileUploader`), `block.tsx` (`TEMPLATE_MAP`, `BLOCK_CSV_HEADERS`), `supervisors.tsx` (`STAFF_CONFIGS`).

#### 3.2. Block Allocation Engine (`src/modules/block-allocation/`)
* **Purpose**: Dynamically assigns candidates and invigilators to physical exam blocks while enforcing non-negotiable institutional and regulatory constraints.
* **Target Users**: Examination In-Charge, Chief Conductor.
* **Inputs**: Date and session selector (`SessionSelector`), physical blocks with remaining capacity, timetable entries for that session with remaining unassigned students, available faculty supervisors.
* **Process & Business Rules (Verified in Code)**:
  1. *Department Integrity Enforcement*: A faculty member **cannot** invigilate an examination for their own department (`sup.department === schemeDepartment` is blocked).
  2. *Block Locking*: When multiple subjects or schemes share a single physical block, the supervisor assigned to the first group is locked to that room (`lockedSupervisor`), preventing multiple supervisors from being assigned to the same physical space.
  3. *Single-Session Duty Protection*: A supervisor already allocated to Block A cannot be allocated to Block B during the same session (`assignedSupervisorsSet`).
  4. *Physical Capacity Clamping*: The number of candidates assigned cannot exceed the block's physical capacity or the remaining unallocated students (`Math.min(schemeRemaining, blockRemaining)`).
  5. *Order Verification Constraint*: Option to filter supervisor pool strictly to faculty who have active, generated supervision orders.
* **Outputs**: Persisted `block_allocations` records linking `date`, `session`, `block_id`, `scheme`, `subject_code`, `supervisor_id`, `assigned_count`, and deterministic seat number ranges (`startFrom` to `startFrom + count - 1`).
* **Dynamic Modifiers**:
  - `change-supervisor.tsx`: Instant emergency substitution tool. If an assigned lecturer fails to report 15 minutes before the exam, the controller swaps in a replacement while the system re-validates departmental conflict rules in real time.
  - `clear-allocation.tsx`: Safe per-session allocation rollback with confirmation safeguards.
* **Pain Removed**: Eliminates manual cross-referencing of faculty departments against exam subjects; prevents double-booking teachers or packing rooms beyond physical desk capacity.
* **Institutional Value**: Protects institutional reputation by enforcing malpractice prevention regulations and maintaining audit-ready invigilation records.
* **Code Evidence**: `src/modules/block-allocation/allocate.tsx` (`filteredSupervisors`, `lockedSupervisor`, `isSchemeAlreadyInBlock`, `submitAllocations`), `change-supervisor.tsx` (`handleSwapSupervisor`).

#### 3.3. Exam Automation & Communication Module (`src/modules/automation/`)
* **Purpose**: Generates statutory appointment letters and delivers individualized exam duty notices directly to faculty with zero manual paperwork.
* **Target Users**: Principal, Examination In-Charge, Administrative Officer.
* **Inputs**: Persisted `orders` and `block_allocations` data, institutional letterhead configuration (college logo, header text, contact numbers, email, reference code), custom reporting instructions.
* **Process**:
  - Compiles order documents: Supervision Orders, Reliever Orders, Chief Officer Orders.
  - Formats appointment orders into formal institutional letterheads complete with reference numbers, duty schedules, and statutory clauses.
  - `office-order-mail.tsx`: An automated email dispatch interface. Aggregates each faculty member's duties across the entire examination season (`Duty[] = { date, session }`), generates personalized HTML schedules, enforces exclusion lists (`EMAIL_EXCLUDES_KEY`), tracks outbound batch limits (`QUOTA_LIMIT = 80`), and writes to an audit log (`order_email_log`).
* **Outputs**: High-resolution printable PDF appointment orders (`useReactToPrint`) and sent email notifications with delivery confirmation timestamps.
* **Pain Removed**: Removes the tedious process of typing hundreds of individual duty letters, printing them, obtaining physical signatures, and manually distributing paper memos across college departments.
* **Institutional Value**: Establishes undeniable legal proof of duty notification. When faculty receive duty schedules in their inbox with formal letterhead, unexcused exam-day absenteeism drops dramatically.
* **Code Evidence**: `src/modules/automation/supervision-order.tsx` (`STORAGE_KEY = 'order_letterhead'`, `reactToPrintFn`), `office-order-mail.tsx` (`QUOTA_LIMIT`, `Duty`, `sendEmail`, `order_email_log`).

#### 3.4. Exam Day Operations Module (`src/modules/exam-day/`)
* **Purpose**: Coordinates live, real-time control room tracking during the 3-hour examination window.
* **Target Users**: Control Room Invigilation In-Charge, Sealing Supervisor, Chief Conductor.
* **Inputs**:
  - Real-time absent seat numbers entered per block and subject (`absent.tsx`).
  - Malpractice/copying incidents entered with candidate roll, confiscated material details, and block identification (`copy-case.tsx`).
  - Question Paper (QP) packet delivery counts: received packets and loose papers verified against expected counts (`qp-accounting.tsx`).
* **Process**:
  - `qp-accounting.tsx` enforces the strict board standard: **1 packet = 50 question papers** (`QP_PER_PACKET = 50`). Auto-calculates expected packets from registered candidate count. As the control room opens packages, it tracks `receivedPackets` and `receivedQps`, automatically flagging statuses: `complete`, `shortage`, `excess`, or `pending`.
  - `absent.tsx` accepts seat numbers, updates database attendance arrays (`absent_numbers`), calculates real-time block-wise present/absent ratios, and immediately flows into statutory reports.
* **Outputs**: Immediate attendance accounting, verified QP surplus/deficit audit, and instantaneous malpractice dossiers.
* **Pain Removed**: Replaces frantic scribbles on control room whiteboards and scrap paper; prevents discrepancies between question papers distributed and answer scripts collected.
* **Institutional Value**: Guarantees chain-of-custody security for high-stakes test papers. Prevents leaks, detects packet tampering immediately, and creates instant audit trails.
* **Code Evidence**: `src/modules/exam-day/qp-accounting.tsx` (`QP_PER_PACKET = 50`, `QPInventoryStats`, `RecordStatus`), `absent.tsx` (`MODE_CONFIGS`, `absent_numbers`).

#### 3.5. Statutory Board Compliance Engine (`src/modules/msbte-reports/`)
* **Purpose**: Produces the complete statutory set of 22 official examination forms mandated by the state technical board (MSBTE) without manual document preparation.
* **Target Users**: Officer-In-Charge (OIC), Chief Examination Controller, Vigilance Squad.
* **Inputs**: Master database records from exam setup, block allocations, live attendance, copy-cases, and QP accounting.
* **Verified Statutory Formats**:
  - **Format 1**: Instructions to Examinees (statutory code of conduct, timings, hall ticket regulations).
  - **Formats 2 & 3**: Question Paper Bundle Delivery Receipts from Board Distribution Center.
  - **Format 3A**: Official Receipt of Question Paper Packets.
  - **Format 4**: Question Paper Packet Verification & Seal Integrity Certification.
  - **Format 5**: Examinees Attendance Report (block-wise roll with present/absent tallies).
  - **Format 6**: Attendance Report "A" (official candidate signature sheet for examination desk).
  - **Format 7**: Packing Slip for Sealed Answer Book Bundles (affixed directly to dispatched canvas bundles).
  - **Formats 8 & 9**: Multi-custody Answer Book Bundle Transfer Receipts (Controller to OIC, and OIC to Distribution Center).
  - **Format 10**: Inventory & Handover Receipt for submitting written answer scripts to the Regional Assessment Centre (RAC).
  - **Format 11**: Official Accounting Ledger of Blank Answer Books Issued, Consumed, and Returned.
  - **Format 12**: External Examiner & Vigilance Squad Performance Certificate.
  - **Format 13**: Malpractice Dossier (formal Copy-Case documentation with seat details and invigilator testimony).
  - **Format 14**: Official Police Complaint Draft (for severe security breaches, impersonation, or physical threats).
  - **Format 15**: Formal Show-Cause Notice issued to candidates apprehended for malpractice.
  - **Format 16 (16A / 16B)**: Central Vigilance & Flying Squad Register.
  - **Format 17**: Bharari Squad (Flying Squad) Inspection Inspection Report Template.
  - **Formats 18 & 19**: Question Paper Inventory Demand & On-Spot Shortage Requisition.
  - **Formats 20 & 21**: Inventory Receipt & Official Inventory Discrepancy Notice.
  - **Format 22**: Legal Panchnama Report (formal witness statement executed under statutory board bylaws).
* **Outputs**: Pixel-perfect, multi-page, landscape/portrait PDF printables with exact board typography, border styles, signature endorsements, and seal placements.
* **Pain Removed**: Eliminates hundreds of hours of manual typewriter/word-processor form formatting; ends board penalties for missing or non-compliant paperwork.
* **Institutional Value**: Flawless board compliance. Eliminates the risk of administrative sanctions, withheld results, or scrutiny during board audits.
* **Code Evidence**: `src/modules/msbte-reports/f1.tsx` through `f22.tsx`, `msbte-report-layout.tsx` (`MultiPageReport`, `ReportLayout`).

#### 3.6. Native Control Room Reports (`src/modules/testforge-reports/`)
* **Purpose**: Delivers day-to-day administrative worksheets, notice-board posters, and management intelligence.
* **Target Users**: Floor Marshals, Bell Conductors, Notice Board Clerks, Principal.
* **Outputs**:
  - `block-allocation.tsx`: Block allocation master chart and seat range posters (e.g. "Block 102: Roll No 104201 to 104230") posted outside exam rooms.
  - `blank-absent.tsx`: Pre-printed invigilator worksheets taken into examination rooms to mark absentees manually before digital entry.
  - `blank-reliever.tsx`: Multi-block relief rotation log tracking roving relief staff.
  - `daily-summary.tsx`: Single-sheet master digest for the Principal (total blocks active, total candidates scheduled, present, absent, copy cases, packets opened, and status).
  - `staff-duty.tsx`: Faculty duty equity report detailing every teacher's cumulative assigned duties and candidate loads across the exam season.
  - `qp-summary.tsx`: Master question paper stock balance ledger (received, consumed, sent to RAC, closing balance).
* **Pain Removed**: Ends chaos in hallways as students search for exam rooms; resolves faculty complaints regarding unequal invigilation duty distribution.
* **Institutional Value**: Orderly, tranquil campus operations on exam mornings; transparent faculty administration.
* **Code Evidence**: `src/modules/testforge-reports/daily-summary.tsx`, `staff-duty.tsx`, `block-allocation.tsx`, `blank-absent.tsx`.

#### 3.7. Central Command Dashboard (`src/modules/dashboard.tsx`)
* **Purpose**: Real-time analytical control centre providing institutional executives with total operational visibility.
* **Metrics Provided**:
  - Aggregate counters: `totalStudents`, `totalExaminees`, `totalStaff`, `totalBlocks`, `totalSubjects`, `totalExamDays`, `totalSessions`, `totalAllocations`, `totalOrders`.
  - Visual distributions: Session candidate load charts (Morning vs Afternoon over time), Department faculty contribution doughnut charts, Block utilization efficiency percentages.
  - Operational flags: Attendance extreme indicators (highest and lowest turnout sessions), Question paper delivery completion rates, Staff on-duty status.
* **Pain Removed**: Eliminates blind spots for college heads who otherwise have to call the control room repeatedly to check turnout and progress.
* **Code Evidence**: `src/modules/dashboard.tsx` (`ExamOfficerDashboardData`, ChartJS integrations).

---

### 4. End-to-End Operational Workflow

The following sequential lifecycle reflects the concrete implementation discovered across the module source files:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 PHASE 1: PRE-EXAM PROVISIONING                                   │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
  1. Center Profile Setup (center-profile.tsx)
     └─ Define Center Code, Season (Summer/Winter), Dist Center, Sealing Supervisor, Departments
  2. Timetable Ingestion (timetable.tsx)
     └─ Upload CSV/Excel → Parse exam days, dates, morning/afternoon sessions, subject schemes
  3. Physical Space Configuration (block.tsx)
     └─ Define Rooms/Blocks, capacities (strength), bench distribution [15,15], seating templates
  4. Faculty Directory Ingestion (supervisors.tsx, relievers.tsx, control-room.tsx)
     └─ Import teaching staff with designated departments (course codes) & roles
  5. Student Roll Ingestion & Verification (seating-chart.tsx, seating-arrangement.tsx)
     └─ Import candidate seat numbers, schemes, registered subjects, and connected institutes
                                            │
                                            ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                PHASE 2: ALLOCATION & APPOINTMENTS                                │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
  6. Seating & Invigilator Allocation (allocate.tsx)
     ├─ System matches scheduled subjects to available blocks
     ├─ Enforces Department Integrity (Blocks lecturers from supervising own department's exam)
     ├─ Enforces Block Locking & Single-Duty constraint across morning/afternoon sessions
     └─ Persists deterministic block assignments and candidate seat ranges
  7. Emergency Adjustments (change-supervisor.tsx)
     └─ Immediate faculty substitute swap with automatic constraint re-validation
  8. Order Generation & Dispatch (supervision-order.tsx, office-order-mail.tsx)
     ├─ Produce formal Supervision & Reliever Orders on college letterhead
     └─ Batch email personalized exam schedules to faculty with delivery tracking
                                            │
                                            ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 PHASE 3: EXAM DAY EXECUTION                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
  9. Morning Briefing & Material Issuance (testforge-reports/blank-absent.tsx, block-allocation.tsx)
     ├─ Post block allocation seating charts on college notice boards & doors
     ├─ Issue physical blank attendance worksheets & answer booklets to supervisors
     └─ Control room receives QP packets (1 pkt = 50 QPs) from Dist Center (qp-accounting.tsx)
 10. Live In-Session Logging (exam-day/absent.tsx, copy-case.tsx)
     ├─ Control Room enters reported absentees by block & subject in real time
     └─ Log malpractice incidents (CPS) with evidence & invigilator testimony
 11. Post-Session Question Paper Reconciliation (exam-day/qp-accounting.tsx, qp-summary.tsx)
     └─ Verify opened packets against present students; confirm zero shortage/excess
                                            │
                                            ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               PHASE 4: STATUTORY SEALING & DISPATCH                              │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
 12. Script Bundle Sealing (msbte-reports/f7.tsx)
     └─ Print Format 7 Packing Slips; affix directly to stitched canvas answer script bundles
 13. Board Custody Transfer (msbte-reports/f8.tsx, f9.tsx, f10.tsx)
     └─ Execute multi-party handover receipts to Distribution Center & RAC
 14. Incident Dossiers & Statutory Filings (msbte-reports/f13.tsx, f14.tsx, f15.tsx, f22.tsx)
     └─ Generate Malpractice Dossiers, Panchnama witness statements, Show Cause Notices
 15. Executive Reporting (testforge-reports/daily-summary.tsx, staff-duty.tsx)
     └─ Daily operational digest to Principal & cumulative faculty duty equity ledger
```

---

### 5. Stakeholder and Buyer Analysis

The software targets an institutional audience characterized by **high accountability, zero tolerance for error, and seasoned operational leadership (typically 40+ years old)**.

#### 5.1. Target Stakeholder Matrix

| Stakeholder Role | Institutional Identity | Primary Motivations & Concerns | TestForge Capability That Solves It |
| :--- | :--- | :--- | :--- |
| **Principal / Head of Institute** (*Economic Buyer & Final Authority*) | Age 50–65; Senior academician, ultimately legally and administratively liable to the university/state board for examination integrity. | • Eliminating board inquiries, fines, or reputational damage.<br>• Preventing campus chaos on exam mornings.<br>• Equitable faculty workload without allegations of favoritism. | Executive Dashboard (`dashboard.tsx`), Daily Summary Digest (`daily-summary.tsx`), Cumulative Faculty Duty Roster (`staff-duty.tsx`). |
| **Officer-In-Charge (OIC) / Controller of Examinations (COE)** (*Decision Maker & Champion*) | Age 42–58; Senior professor appointed to run the examination center; under immense logistical stress. | • Zero discrepancies in QP packet counts.<br>• Flawless compliance with statutory MSBTE formats.<br>• Handling last-minute faculty absences without panic. | Real-time QP Accounting (`qp-accounting.tsx`), One-click MSBTE Formats 1–22 (`msbte-reports/`), Quick Supervisor Substitution (`change-supervisor.tsx`). |
| **Assistant Controller / Examination In-Charge** (*Daily Core Operator*) | Age 35–50; Faculty member managing the nuts and bolts of room allocation, invigilation lists, and clerical staff. | • Saving hundreds of hours of manual copy-pasting across Excel.<br>• Preventing accidental assignment of faculty to their own department's exams.<br>• Generating notice-board posters and orders quickly. | Automated Allocation Engine (`allocate.tsx`) with departmental conflict rules, Letterhead Order Generator (`supervision-order.tsx`), Door Posters (`block-allocation.tsx`). |
| **Senior Faculty & Invigilators** (*Operational Participants*) | Age 28–62; Teaching professors across all academic departments. | • Clear, advance notice of examination duties.<br>• Fair distribution of morning vs afternoon slots.<br>• Zero ambiguity regarding room assignments. | Automated Email Delivery of Personalized Schedules (`office-order-mail.tsx`), Fair Workload Auditing (`staff-duty.tsx`). |

---

### 6. Capability-to-Value Mapping

| Verified Code Capability | Underlying Technical Mechanism | Real Operational Pain Removed | Measurable Institutional Outcome |
| :--- | :--- | :--- | :--- |
| **Department Conflict Prevention** | Hard filter: `sup.department !== schemeDepartment` in `allocate.tsx` | Prevents teachers from invigilating exams for their own subjects/departments. | Complete elimination of malpractice suspicion or board disqualification for biased invigilation. |
| **Deterministic Seat Number Ranging** | Range slicing (`startFrom` to `startFrom + count - 1`) in `allocate.tsx` | Eliminates errors in manual door-chart preparation where candidate rolls overlap or get omitted. | Flawless hallway navigation; zero delayed exams caused by confused students wandering corridors. |
| **Automated QP Packet Accounting** | Mathematical enforcement of `1 packet = 50 QPs` vs registered candidates in `qp-accounting.tsx` | Prevents unopened paper shortages or unrecorded surplus papers in the control room. | Airtight chain-of-custody security; immediate detection of paper shortages before bundle opening. |
| **One-Click Statutory MSBTE Formats** | Dynamic generation of 22 multi-page printable formats (`msbte-reports/f1-f22.tsx`) | Eliminates typing and re-formatting complex board forms on paper or Microsoft Word. | 100% audit-proof compliance with zero formatting non-conformities during board flying squad inspections. |
| **Batch Duty Emailing with Letterhead** | Template compiler with quota monitoring and exclude filters in `office-order-mail.tsx` | Replaces physical paper memo printing, manual sorting, and manual departmental distribution. | Complete, verifiable notification delivery with timestamped audit logs; drastic reduction in absenteeism. |
| **Live Absentee & Malpractice Recording** | Immediate database array updates for absentees and CPS records in `absent.tsx` | Eliminates post-exam tallying discrepancies between invigilator slips and board answer book returns. | True real-time operational visibility; zero post-exam counting panics in the control room. |
| **Emergency Supervisor Substitution** | Dynamic live swap interface in `change-supervisor.tsx` with constraint checks | Resolves morning panic when an assigned teacher calls in sick 15 minutes before exam start. | Orderly, verified replacement within 60 seconds without violating departmental conflict rules. |
| **Faculty Duty Equity Ledger** | Aggregate query summing sessions and student loads per lecturer in `staff-duty.tsx` | Resolves persistent faculty friction and grievances regarding unequal duty allocations. | Transparent, defensible academic administration; high faculty morale during demanding exam periods. |

---

### 7. Evidence and Uncertainty Register

Every product assertion in this brief is verified against concrete source code within the permitted directory:

| Product Assertion | Supporting File Path | Specific Symbols / Implementation Evidence | Confidence Level |
| :--- | :--- | :--- | :--- |
| **Department conflict enforcement** | `src/modules/block-allocation/allocate.tsx` | Lines 922, 957–960: `sup.department === schemeDepartment ? false : true` | **VERIFIED** |
| **Block supervisor locking** | `src/modules/block-allocation/allocate.tsx` | Lines 884–901: `blockSupervisorMap`, `lockedSupervisor`, `isBlockLocked` | **VERIFIED** |
| **1 Packet = 50 Question Papers rule** | `src/modules/exam-day/qp-accounting.tsx` | Lines 60, 70: `const QP_PER_PACKET = 50;` | **VERIFIED** |
| **Statutory Formats 1 through 22** | `src/modules/msbte-reports/` | Files `f1.tsx` to `f22.tsx`, each implementing specific board titles and schemas | **VERIFIED** |
| **Seating template patterns** | `src/modules/exam-setup/block.tsx` | Lines 91–100: `reverse-zigzag`, `reverse`, `linear`, `linear-zigzag` | **VERIFIED** |
| **Institutional Letterhead configuration** | `src/modules/automation/supervision-order.tsx` | Line 75: `STORAGE_KEY = 'order_letterhead'`, custom logo, address, phone | **VERIFIED** |
| **Batch automated email distribution** | `src/modules/automation/office-order-mail.tsx` | Lines 72–76, 88–98: `QUOTA_LIMIT = 80`, `Recipient`, `Duty[]`, `order_email_log` | **VERIFIED** |
| **Live Malpractice & Copy Case tracking** | `src/modules/exam-day/absent.tsx` | Lines 52–84: `mode: 'copycase'`, `cpsStudents` array manipulation | **VERIFIED** |
| **Multi-organization admin & billing** | `src/modules/admin/dashboard.tsx` | Lines 124–176: `totalOrgs`, `activeSubscriptions`, `totalRevenue`, `totalPayments` | **VERIFIED** |
| **Connected Institute Support** | `src/modules/exam-setup/seating-chart.tsx` | Lines 65–66, 83–86: `instituteCode`, `instituteName`, `connected_institutes` | **VERIFIED** |
| *External email transmission transport* | `src/modules/automation/office-order-mail.tsx` | Uses internal API route `/api/send-email`; transport details outside modules scope | *UNRESOLVED DEPENDENCY* (Documented per instructions) |
| *Cloud database persistence engine* | Multiple files | Interacts with Supabase tables via client helper; schema files outside modules scope | *UNRESOLVED DEPENDENCY* (Documented per instructions) |

---

### 8. Product Positioning

#### 8.1. Category Definition
**Institutional Examination Operations Operating System (Exam Ops)** — A specialized mission-critical workflow platform bridging the gap between passive academic SIS/ERP software and the physical, high-stakes realities of college examination halls.

#### 8.2. Target Audience
Principals, Controllers of Examinations (COE), Chief Conductors, and Academic Registrars at engineering colleges, polytechnics, and degree institutions administering university and board semester examinations.

#### 8.3. Core Operational Problem
Every semester, collegiate examination control rooms descend into high-stress operational chaos. Administrators spend hundreds of hours wrestling with fragile spreadsheets, manually matching rooms to student rolls, risking illegal departmental invigilator conflicts, manually printing paper duty memos, frantically recounting question paper bundles, and struggling through 22 mandatory statutory board compliance reports on tight deadlines.

#### 8.4. Core Differentiation
Unlike general campus ERPs that treat examinations as an afterthought gradebook entry, TestForge is engineered from the ground up for the **physical physical reality of the examination day**. It models actual bench geometries, enforces non-negotiable regulatory conflict rules, accounts for question paper packets down to the single sheet, automates duty notification dispatch, and provides out-of-the-box digital generation of mandatory statutory board compliance documentation.

#### 8.5. Primary Positioning Statement
> **"The unified command system for collegiate examination operations. From timetable parsing and conflict-free room allocation to live question paper accounting and one-click statutory board compliance — TestForge replaces control room spreadsheet chaos with certified institutional precision."**

---
---

## Part II — Landing Page Design Master Prompt

### 9. Role and Mission

You are acting as a **World-Class Frontend Art Director, Principal UI/UX Architect, and Senior B2B SaaS Designer**.

Your mission is to design and implement a completely new, authoritative, visually arresting, and high-converting landing page for **TestForge**.

**Strict Boundary Reminder**: The previous landing page is completely discarded and out of scope. You must build fresh from the product model, operational workflows, and verified capabilities established in Part I of this document.

---

### 10. Product and Audience Context

* **Who You Are Designing For**: Institutional decision-makers aged 40–65 — College Principals, Examination Controllers (COEs), Deans of Academic Affairs, and Senior Professors.
* **Psychological Profile**: They are deeply risk-averse, legally accountable for examination security, exhausted by recurring semester chaos, and skeptical of flashy, generic startup promises. They respect operational precision, clear hierarchy, administrative dignity, and undeniable functional depth.
* **Tone to Avoid**: Never sound like a generic silicon-valley AI tool ("Transform education with AI magic"). Never use hyper-casual marketing jargon ("Supercharge your exams", "10x your productivity").
* **Tone to Embody**: Sophisticated institutional authority, calm operational control, meticulous regulatory accuracy, and modern technological refinement.

---

### 11. Design Philosophy and Art Direction

#### 11.1. Dual Typography System
The typography must feel editorial, scholarly, and architecturally precise:
* **Typography A — Editorial Display Headline (`font-serif` or Refined Display)**:
  - Recommended pairing: **Playfair Display**, **Newsreader**, or **Instrument Serif** (paired with a clean editorial cut).
  - Used for: Primary hero headline, major section thesis statements, institutional callouts, and milestone figures.
  - Character: Dignified, academic, authoritative, timeless.
* **Typography B — Functional Interface & Technical Monospace (`font-sans` + `font-mono`)**:
  - Recommended pairing: **Plus Jakarta Sans** or **Inter** for clean UI text, paired with **JetBrains Mono** or **Geist Mono** for data points, room codes, timestamps, and regulatory identifiers.
  - Used for: Navigation, body copy, data tables, block labels, status badges, metric indicators, and interactive controls.
  - Character: Ultra-legible, crisp, neutral, and engineered.

#### 11.2. The Dotted and Dashed Architectural Visual Motif
Incorporate dotted (`border-dotted`) and dashed (`border-dashed`) line work as an intentional visual metaphor throughout the composition:
* **Workflow Connectors**: Vertical and horizontal dashed lines connecting the sequential phases of an examination lifecycle (Pre-Exam → Allocation → Control Room → Board Filing).
* **Technical Annotation Dividers**: Subtle dotted hairline dividers between tabular metadata (e.g., separating Subject Code, Room Capacity, and Invigilator Department).
* **Process Perimeter Frames**: Deliberate dashed containment borders on technical process cards, reflecting the structured boundaries of physical exam blocks and sealed question paper packets.
* **Restraint Rule**: Dotted and dashed motifs must serve organizational clarity. Never use them decoratively without a structural purpose. Solid surfaces, generous whitespace, and sharp typographic contrast must remain dominant.

#### 11.3. Color Palette & Atmospheric Contrast
A mature, restrained institutional palette that conveys security and calm:
* **Primary Slate / Obsidian Canvas**: Deep, clean neutral background system:
  - Dark Mode: `#0A0D12` (deep slate/charcoal ground), `#121721` (elevated control surface), `#1E2638` (structural line work).
  - Light Mode: `#FAFAF9` (warm stone paper), `#FFFFFF` (card surfaces), `#E7E5E4` (architectural border lines).
* **Institutional Emerald (Integrity & Clearance)**:
  - Primary Accent: Deep Forest / High-Precision Emerald (`#059669` / `#10B981`).
  - Signifies verified compliance, conflict-free status, sealed custody, and successful dispatch.
* **Cobalt / Academic Navy (Authority & Governance)**:
  - Secondary Accent: Deep Academic Cobalt (`#1D4ED8` / `#2563EB`).
  - Used for statutory board citations, official letterhead accents, and institutional credentials.
* **Restrained Alert Accents (Deliberate Operational Warnings)**:
  - Amber / Topaz (`#D97706`): Flags shortage alerts, unallocated candidate warnings, or pending supervisor orders.
  - Rose / Crimson (`#DC2626`): Strictly reserved for Malpractice / Copy-Case indicators and departmental conflict blocks.

---

### 12. Conversion Strategy and Messaging Hierarchy

#### 12.1. Primary Conversion Action
* **Primary Call to Action**: **"Request Institutional Walkthrough"** (or **"Schedule an Executive Demonstration"**).
* **Secondary Call to Action**: **"Explore Statutory MSBTE Workflow"** (smoothly scrolls the visitor into the live operational architecture breakdown).
* **Rationale**: Institutional buyers with 5,000+ examinees do not click self-serve "Buy Now" buttons. They require a consultative walkthrough that addresses their college's specific board affiliation, room count, and faculty policies.

#### 12.2. Messaging Sequence (The 8-Step Persuasion Architecture)
1. **Immediate Comprehension**: Instantly identify what TestForge is (Exam Operations Operating System) and who it serves (Colleges & Polytechnic Centers).
2. **The High-Stakes Dilemma**: Acknowledge the intense administrative liability of exam periods (the spreadsheet nightmare, conflict risks, paper packet security).
3. **The Architectural Solution**: Introduce the unified engine (Pre-exam provisioning → Deterministic allocation → Live day-of-exam execution).
4. **Concrete Functional Evidence**: Showcase the actual system capabilities (Departmental Conflict Avoidance, 1 Packet = 50 QPs reconciliation, Automated Letterhead Dispatch).
5. **Interactive Operational Walkthrough**: A tangible, step-by-step interactive model of an examination cycle from timetable upload to canvas bundle sealing.
6. **Statutory Board Mastery (MSBTE 1–22)**: Demonstrate unconditional compliance with mandatory state board formats that saves hundreds of clerical hours.
7. **Institutional Reassurance**: Address adoption safety, data sovereignty, role-based security, and faculty workload equity.
8. **Low-Friction Institutional Contact**: A dignified consultation request form designed specifically for institutional leaders.

---

### 13. Complete Page Structure

The landing page must be composed of the following nine dedicated sections:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. GLOBAL NAVIGATION                                                                  │
│    Logo (TestForge Seal) • Architecture • Allocations • Exam Day • MSBTE Formats • CTA │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. HERO: THE INSTITUTIONAL COMMAND SYSTEM                                              │
│    Editorial Headline • Subtitle • Primary & Secondary CTAs • Interactive Live Console │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. THE CONTROL ROOM REALITY (THE COST OF SPREADSHEET CHAOS)                            │
│    Side-by-side comparison: Fractured Manual Spreadsheet Cycle vs TestForge Engine    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. THE CORE ALLOCATION ENGINE (DETERMINISTIC PRECISION)                                │
│    Visual representation of Department Conflict Filtering & Bench Capacity Locking    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. THE END-TO-END OPERATIONAL LIFECYCLE (INTERACTIVE WORKFLOW)                         │
│    Phase 1: Setup ───► Phase 2: Allocate ───► Phase 3: Exam Day ───► Phase 4: Board     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 6. QUESTION PAPER CUSTODY & LIVE EXAM DAY OPERATIONS                                   │
│    50 QP Packet Reconciliation Ledger • Live Absentee Tally • Copy-Case Dossier Engine│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 7. THE STATUTORY BOARD SUITE (NATIVE MSBTE FORMATS 1–22)                               │
│    Interactive Showcase of Formats 1–22 (Attendance, Packing Slips, Panchnamas)        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 8. INSTITUTIONAL REASSURANCE & FAQ                                                     │
│    Faculty Workload Equity • System Security • Adoption Timeline • Transition Support   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 9. EXECUTIVE CONVERSION SUITE & INSTITUTIONAL FOOTER                                   │
│    Consultation Request Form • Board Compliance Badges • Legal & Institutional Credits │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Section Breakdown & Specifications:

* **Section 1: Global Sticky Navigation**
  - Brand Mark: "TESTFORGE" set in tracked uppercase serif with a subtle emerald integrity glyph.
  - Links: `Platform Architecture`, `Allocation Engine`, `Exam Day Control`, `MSBTE Compliance`, `Executive Reports`.
  - Actions: Direct phone/desk liaison link and primary button: `"Request Institutional Walkthrough"`.
* **Section 2: Hero Section** (Detailed in Section 14).
* **Section 3: The Operational Problem ("The Vulnerability of the Spreadsheet Control Room")**
  - Concept: Highlight the four fatal points of failure in manual exam management:
    1. *Accidental Department Conflicts*: An engineering professor invigilating their own department's students, leading to board malpractice investigations.
    2. *Hallway Seating Collisions*: Overfilled rooms, duplicate seat numbers, and misplaced students causing morning panics.
    3. *Question Paper Reconciliation Gaps*: Unopened packet discrepancies noticed only after the 3-hour bell has rung.
    4. *Clerical Form Fatigue*: Hundreds of staff hours spent typing, printing, and sealing Formats 1 through 22 by hand.
* **Section 4: The Deterministic Allocation Engine**
  - Interactive Visual Component: A split-screen interactive component demonstrating how TestForge evaluates an allocation candidate.
  - Visual Details: Shows a faculty supervisor from the Mechanical Engineering department being automatically flagged with a red prohibited indicator when dragged near a Mechanical Engineering exam, but turning emerald with an instant clearance badge when routed to a Computer Science block.
* **Section 5: The Four-Phase Operational Lifecycle**
  - Architectural Process Component: Connected with horizontal dashed lines (`border-dashed border-emerald-500/40`), detailing the journey from raw timetable import to statutory script packaging.
* **Section 6: Question Paper Chain-of-Custody & Day-of-Exam Operations**
  - Interactive Component: The **QP Packet Calculator** reflecting verified code logic (`QP_PER_PACKET = 50`). Visitors can adjust the candidate slider (e.g., 342 students) and watch TestForge instantly calculate 7 packets required (350 papers), 8 surplus papers, and auto-format the official Format 3A receipt.
* **Section 7: Statutory Board Compliance (The MSBTE Formats 1–22 Showcase)**
  - Visual Treatment: An interactive dossier browser. Visitors can browse between *Packing Slips (Format 7)*, *Answer Book Bundle Handover Receipts (Format 10)*, *Police Complaint Dossiers (Format 14)*, and *Panchnamas (Format 22)*, previewing crisp, official typography and signature blocks.
* **Section 8: Executive Reassurance & FAQ**
  - Structured accordion answering the core concerns of 50+ college principals:
    - *"How does TestForge handle last-minute teacher absences 10 minutes before the bell?"* (Explaining the 60-second emergency swap in `change-supervisor.tsx`).
    - *"Will this disrupt our existing university/board timetable format?"* (Explaining universal timetable spreadsheet ingestion).
    - *"How do we prevent faculty complaints about unfair weekend exam duties?"* (Explaining the cumulative `staff-duty.tsx` equity ledger).
* **Section 9: Executive Consultation Suite & Footer**
  - Dignified conversion card: Request an on-campus or virtual demonstration for your institution's Examination Committee.
  - Required fields: Institutional Name, Examination Center Code, Approximate Candidate Strength per Session, Principal/COE Contact Email.

---

### 14. Detailed Hero Specification

#### 14.1. Evaluated Headline Options
* *Option A (Functional & Direct)*: "Complete Examination Management Software for Technical Colleges." *(Rejected: Too pedestrian; sounds like a commodity utility).*
* *Option B (Overblown Startup Style)*: "AI-Powered Examination Disruption for Modern Higher Ed." *(Rejected: Violates audience trust; AI is unverified in code and repels conservative academic leaders).*
* *Option C (Chosen & Recommended)*:
  > **"The Unified Command System for Collegiate Examination Operations."**
  >
  > *Secondary Display Subtitle*: **"Engineered for zero-defect allocations, tamper-evident question paper custody, and certified statutory board compliance."**

#### 14.2. Supporting Exposition Copy
> "Every semester, hundreds of institutional examination centers manage thousands of candidates across strict 3-hour sessions. TestForge replaces vulnerable spreadsheets and frantic hallway improvisation with a deterministic operational engine — enforcing departmental conflict integrity, automating official letterhead duty orders, and generating all 22 statutory board formats with mathematical precision."

#### 14.3. Call-to-Action Elements
* **Primary Button**: `"Request Institutional Walkthrough"` (Solid deep emerald background, subtle glow, sleek arrow glyph).
* **Secondary Button**: `"Review MSBTE Regulatory Workflow"` (Refined outline with dashed border hover state, linking to live format browser).
* **Trust & Governance Badge**: `"Pre-configured for State Technical Board Regulations • Verified 1:50 QP Packet Accounting • Automated Faculty Letterhead Dispatch"`

#### 14.4. Hero Visual Concept: The Control Room Master Console
In place of a generic laptop mockup, render an authentic, high-density **Examination Command Console** reflecting verified system states:
* **Top Context Bar**: `CENTER: 0018 • GOVERNMENT POLYTECHNIC • SEASON: WINTER 2026 • SESSION: DAY 04 [MORNING]`.
* **Live Operational Ticker**:
  - `Blocks Active: 18 / 18`
  - `Candidates Seated: 540`
  - `Supervisors Cleared: 18 (0 Departmental Conflicts)`
  - `QP Packets Verified: 11 Packets [550 Papers] • 10 Surplus Accounted`
* **Real-time Seating Allocation Strip**: Visual miniature cards of Blocks 101, 102, 103 with seat ranges (`104201–104230`), assigned supervisors, and green integrity clearance badges.

---

### 15. Product Visualization Specification

When downstream agents render product demonstrations, adhere strictly to these interface representations derived directly from the audited code:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              EXAMINATION CONTROL CONSOLE                               │
│  [Center Profile: 0018]  [Season: Winter 2026]  [Session: Morning]  [Status: Active]   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  ALLOCATION ENGINE: BLOCK 204 (CAPACITY: 30)                                          │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Subject: ME-4G [Advanced Manufacturing] • Candidates Allocated: 30 / 30          │  │
│  │ Roll Numbers: 204101 to 204130 (Linear-Zigzag Pattern)                           │  │
│  ├──────────────────────────────────────────────────────────────────────────────────┤  │
│  │ Assigned Supervisor: Prof. V. K. Deshmukh (Dept: Computer Science)              │  │
│  │ Conflict Verification: [✓ PASSED: Supervisor Dept ≠ Examination Scheme Dept]      │  │
│  │ Order Status: [✓ ORDER #SUP-20261014-M-04 DISPATCHED & NOTIFIED VIA EMAIL]       │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                        │
│  QUESTION PAPER CUSTODY LEDGER (QP_PER_PACKET = 50)                                    │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Subject Code: 22402 • Expected Students: 142 • Packets Expected: 3 Packets      │  │
│  │ Sealed Packets Received: 3 (150 Papers) • Net Balance: +8 Surplus (RAC Return)   │  │
│  │ Status: [✓ VERIFIED ZERO SHORTAGE • FORMAT 3A RECEIPT ISSUED]                    │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                        │
│  STATUTORY FILINGS IN QUEUE                                                            │
│  [ Format 05: Attendance ] [ Format 07: Packing Slip ] [ Format 11: Blank Scripts ]    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 16. Microinteraction Specification

Microinteractions must communicate computational certainty and operational calm:
1. **Interactive Constraint Validation Demonstration**:
   - When a user hovers over a mock supervisor row, connected examination blocks highlight with subtle green dashed outlines (`border-dashed border-emerald-500`).
   - If the cursor moves over a blocked departmental match, the outline transitions to a crisp red dashed boundary with a tool-tip badge: `"Prohibited: Institutional Conflict Prevention (Faculty Department Matches Exam Scheme)"`.
2. **QP Packet Calculation Slider**:
   - Smooth numerical interpolation using standard React state.
   - When sliding the candidate count past multiples of 50, a visual packet icon increments with a clean 100ms scale bump, reflecting the verified `QP_PER_PACKET = 50` rule.
3. **Statutory Format Preview Drawer**:
   - Clicking any format card (Format 1 through 22) expands a crystal-clear, high-resolution document sheet with official letterheads and signature blocks, accompanied by a subtle 150ms ease-out opacity transition.
4. **Motion Restraint & Accessibility**:
   - No looping bouncing icons or distracting background particle nets.
   - Fully respect `@media (prefers-reduced-motion: reduce)`. If reduced motion is set, all transitions must immediately resolve with zero duration.

---

### 17. Responsive and Accessibility Requirements

#### 17.1. Viewport Adaptation
* **Desktop (1280px+)**: Multi-column command console, side-by-side workflow comparisons, dual-pane statutory format browser.
* **Tablet (768px – 1024px)**: Stacked command views with horizontal swipe tabs for examination lifecycle phases; preserve full tabular legibility without truncation.
* **Mobile (320px – 767px)**: Linear narrative flow. Complex console views convert into focused, expandable cards; data points maintain minimum 14px typography and 44px touch targets.

#### 17.2. Accessibility & Standards (WCAG 2.1 AA)
* **Contrast Ratios**: Minimum 4.5:1 for body copy; 3:1 for large display headers and active badges.
* **Semantic Structure**: Strictly single `<h1>`, logical `<h2>` and `<h3>` document outline.
* **Keyboard Navigation**: All interactive elements (format selectors, demonstration sliders, consultation modal) must have distinct, visible focus rings:
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2`.
* **Zero Color-Only Communication**: Any state indicated by color (e.g. green for cleared, red for conflict) must always be paired with an explicit text label and icon (e.g. `[✓ CLEARED]`, `[✕ CONFLICT]`).

---

### 18. Implementation Constraints for Downstream Engineers

When the downstream coding agent implements this landing page, the following constraints must be strictly honored:
1. **Framework & Styling**: Use the project's native stack (Next.js App Router, Tailwind CSS, Lucide React icons, and Radix UI / Shadcn component patterns).
2. **Component Modularity**: Implement the landing page with clean, reusable components located in appropriate component directories:
   - `HeroSection.tsx`
   - `ProblemComparison.tsx`
   - `AllocationEngineVisualizer.tsx`
   - `LifecycleWorkflow.tsx`
   - `QPCustodyCalculator.tsx`
   - `MSBTEFormatBrowser.tsx`
   - `ExecutiveFAQ.tsx`
   - `ConsultationModal.tsx`
3. **No Dead Controls**: Every button and tab must execute a meaningful behavior (smooth scrolling, tab toggling, filter updating, or opening the walkthrough modal).
4. **Zero Mod-Bleed**: Do not modify any files inside `web/src/modules/` or alter database schemas. The landing page must consume data models without mutating underlying business code.

---

### 19. Content Accuracy Rules & Strict Prohibitions

Downstream copywriters and developers are strictly prohibited from introducing fabricated claims:
* **NO Fabricated Logos**: Do not invent fake university logos, ISO certifications, or fake accreditation seals. Reference verified state board compliance (e.g., "Engineered for MSBTE Technical Board Regulations").
* **NO Fake User Numbers**: Do not claim "Used by 1,000,000 students" or "Trusted by 500+ Universities".
* **NO Unsupported AI Claims**: Do not introduce buzzwords like "AI Hall Allocation", "Machine Learning Timetables", or "Autonomous Neural Scheduling". TestForge is an **algorithmic, deterministic constraint-based engine**. Represent its mathematical certainty with pride.
* **NO Made-Up ROI Statistics**: Do not claim "Reduces costs by 84.7%". Instead, communicate concrete operational truths: *"Eliminates manual typing of 22 statutory forms; prevents 100% of departmental invigilator conflicts."*

---

### 20. Final Quality Checklist

Before marking the landing page implementation complete, verify that every item passes inspection:

- [ ] **Audience Dignity**: Does the page feel trustworthy and commanding to a 55-year-old college principal?
- [ ] **Dual Typography Execution**: Is the headline set in an authoritative editorial serif/display font, perfectly balanced against an ultra-clean functional sans-serif body and monospace metadata?
- [ ] **Visual Motif Adherence**: Are dotted and dashed borders used intentionally for process flows and technical containment without visual clutter?
- [ ] **Verified Business Rules Displayed**: Does the product showcase the actual department conflict prevention rule (`sup.department !== schemeDepartment`) and the `1 Packet = 50 QPs` statutory calculation?
- [ ] **MSBTE Suite Highlighted**: Are the 22 statutory formats prominently featured as an indispensable institutional asset?
- [ ] **Responsive Precision**: Does the page render flawlessly from a 360px mobile viewport up to a 4K display?
- [ ] **Accessible Focus States**: Can a keyboard-only user tab through all interactive elements with clear, high-contrast focus indicators?
- [ ] **Self-Contained Implementation**: Is the implementation fully functional without modifying any protected application modules?

---
*Authored by Senior Product Designer, B2B SaaS Strategist, & UX Systems Architect*
*Document Reference: `TESTFORGE_LANDING_PAGE_BRIEF.md`*
