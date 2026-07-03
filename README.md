# 🚀 TestForge – MSBTE Examination Management Platform

> A modern examination management platform built for **MSBTE-affiliated institutes** to automate the complete end-semester examination workflow.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-Latest-009688?logo=fastapi)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![License](https://img.shields.io/badge/License-Proprietary-red)

---

## 📖 Overview

**TestForge** streamlines the complete examination lifecycle for MSBTE institutes.

Instead of managing dozens of spreadsheets manually, institutes can upload their timetable once and let TestForge automate:

- Timetable processing
- Student seating configuration
- Block allocation
- Supervisor assignment
- Question paper accounting
- Office orders
- MSBTE report generation
- Exam-day operations

The result is a workflow that reduces exam preparation from **weeks to hours**.

---

# ✨ Features

## 📅 Examination Setup

- HTML & Excel timetable upload
- Automatic timetable parsing
- Student seating chart import
- Connected institute management
- Subject mapping
- Block management

## 🪑 Seating Management

- Seating chart validation
- Automatic seat allocation
- Student verification
- Multi-institute support
- Absent student management

## 🧱 Block Allocation

- Intelligent block allocation
- Supervisor assignment
- Reliever assignment
- Floor-wise organization
- Printable allocation sheets

## 👥 Staff Management

- Supervisor management
- Reliever management
- Control room staff
- Internal/External staff
- Staff availability tracking

## 📄 MSBTE Reports

Generate all official MSBTE formats:

- F1 – F22
- Seating statements
- Attendance sheets
- Supervisor reports
- Packet accounting
- Office orders
- Control room reports

## 📦 Question Paper Inventory

- Packet tracking
- Packet issue/return
- Inventory accounting
- Packet reconciliation

## 📈 Exam Day Dashboard

- Live attendance
- Copy case management
- Missing packets
- Real-time statistics
- Examination progress

## 💳 Subscription System

- Razorpay integration
- Promo codes
- Subscription management
- Payment verification

---

# 🛠 Tech Stack

| Layer | Technology |
|--------|------------|
| Frontend | Next.js 15, React 19, TypeScript |
| Backend | FastAPI, Python 3.11 |
| Database | PostgreSQL 16 |
| ORM | SQLAlchemy |
| Authentication | Better Auth |
| UI | Tailwind CSS, shadcn/ui |
| Excel Processing | Pandas, OpenPyXL |
| HTML Parsing | BeautifulSoup4 |
| Payments | Razorpay |
| Deployment | Docker |

---

# 📁 Project Structure

```text
testforge-v1.2/
│
├── backend/
│   ├── routers/
│   ├── auth.py
│   ├── config.py
│   ├── utils.py
│   └── main.py
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── modules/
│   ├── lib/
│   └── public/
│
├── database/
├── data/
├── docker-compose.yml
└── README.md
```

---

# ⚙️ Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL 16+
- Docker
- Git
- pnpm (recommended)

---

# 🚀 Installation

## Clone Repository

```bash
git clone <repository-url>

cd testforge-v1.2
```

---

## Start Database

```bash
docker-compose up -d
```

---

## Backend Setup

```bash
cd backend

python -m venv venv

source venv/bin/activate
# Windows
# venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env
```

Configure your `.env`.

---

## Frontend Setup

```bash
cd ../frontend

pnpm install

cp .env.example .env.local
```

---

## Push Database Schema

```bash
pnpm db:push
```

---

## Start Backend

```bash
cd ../backend

uvicorn main:app --reload
```

Runs on:

```
http://localhost:8000
```

---

## Start Frontend

```bash
cd ../frontend

pnpm dev
```

Runs on:

```
http://localhost:3000
```

---

# 🔐 Environment Variables

## Backend

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/testforge

NEXT_PUBLIC_APP_URL=http://localhost:3000

RAZORPAY_KEY_ID=

RAZORPAY_KEY_SECRET=

GOOGLE_CLIENT_ID=

GOOGLE_CLIENT_SECRET=

TESTING=true

TEST_EXAM_CENTER_ID=
```

---

## Frontend

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000

NEXT_PUBLIC_BACKEND_URL=http://localhost:8000

NEXT_PUBLIC_RAZORPAY_KEY_ID=
```

---

# 📦 Main Modules

| Module | Description |
|----------|-------------|
| Dashboard | Real-time exam center overview |
| Timetable | Upload & manage exam timetable |
| Seating Chart | Student seating configuration |
| Connected Institutes | Institute management |
| Block Allocation | Student allocation to blocks |
| Staff Management | Supervisor & reliever management |
| Reports | Official MSBTE report generation |
| Office Orders | Automated duty order generation |
| Question Paper Accounting | Packet inventory management |
| Exam Day Dashboard | Live examination operations |

---

# 🧪 Development

## Frontend

```bash
cd frontend

pnpm dev
```

### Run Tests

```bash
pnpm test
```

---

## Backend

```bash
cd backend

uvicorn main:app --reload
```

### Run Tests

```bash
pytest
```

---

# 🗄 Database Commands

Push schema

```bash
pnpm db:push
```

Generate migrations

```bash
pnpm db:generate
```

Open database studio

```bash
pnpm db:studio
```

---

# 🐳 Docker Deployment

Development

```bash
docker-compose up -d
```

Production

```bash
docker-compose \
-f docker-compose.yml \
-f docker-compose.prod.yml \
up -d
```

---

# 📊 Workflow

```text
Upload Timetable
        │
        ▼
Import Seating Chart
        │
        ▼
Verify Students
        │
        ▼
Allocate Blocks
        │
        ▼
Assign Supervisors
        │
        ▼
Generate Office Orders
        │
        ▼
Conduct Examination
        │
        ▼
Generate MSBTE Reports
```

---

# 🎯 Highlights

- ✅ Complete MSBTE workflow automation
- ✅ Multi-institute support
- ✅ Official F1–F22 reports
- ✅ Excel & HTML import
- ✅ Automated block allocation
- ✅ Staff duty generation
- ✅ Question paper accounting
- ✅ Modern dashboard
- ✅ Docker ready
- ✅ Production ready

---

# 📄 License

This software is proprietary.

All rights reserved.

For licensing or commercial inquiries, contact:

**support@testforge.tech**

---

# 🤝 Support

**Website**

https://testforge.tech

**Documentation**

https://docs.testforge.tech

**Email**

support@testforge.tech

---

<div align="center">

### Built with ❤️ for MSBTE Examination Centres

**Acharya Technologies**

</div>
