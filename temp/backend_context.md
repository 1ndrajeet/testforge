# TestForge (v1.2) – Backend Context & Architecture

## 1. Overview & Purpose

The **TestForge Backend** is a high-performance Python service built with **FastAPI** and **SQLAlchemy**. Its primary responsibility is **heavy data ingestion, validation, sanitization, and batch processing** of large MSBTE examination files (HTML timetables and complex multi-column Excel workbooks).

By delegating file parsing and Excel manipulation to Python (utilizing `pandas`, `openpyxl`, and `beautifulsoup4`), the application achieves high processing throughput while offloading CPU-intensive parsing from the Next.js runtime.

---

## 2. Technical Stack & Dependencies

- **Framework**: FastAPI (`0.136.3`) running on ASGI server Uvicorn (`0.49.0`)
- **Database Access**: SQLAlchemy (`2.0.50`) with `psycopg2-binary` (`2.9.12`)
- **Data Manipulation**:
  - `pandas` (`3.0.3`): Excel parsing, tabular cleaning, vectorized row operations
  - `openpyxl` (`3.1.5`): Excel reading and writing (.xlsx)
  - `beautifulsoup4` (`4.15.0`) & `soupsieve` (`2.8.4`): HTML timetable parsing
- **HTTP Client**: `httpx` (`0.28.1`) for asynchronous session verification with Better Auth
- **Data Validation**: `pydantic` (`2.13.4`) & `pydantic_core` (`2.46.4`)
- **Environment Management**: `python-dotenv` (`1.2.2`)

---

## 3. Directory & File Structure

```text
backend/
├── main.py                     # FastAPI application setup, CORS, middleware, lifecycle
├── config.py                   # Settings class, database connection pool, execute helpers
├── auth.py                     # get_exam_center_id dependency (Better Auth bridge)
├── schemas.py                  # API response schemas (APIResponse)
├── utils.py                    # File sanitizers, validators, hashing, response builders
├── requirements.txt            # Locked Python package dependencies
├── Dockerfile                  # Container definition for containerized backend
├── render.yaml                 # Deployment specification for Render platform
└── routers/                    # Route handlers mounted under /api
    ├── __init__.py             # Router aggregation (api_router)
    ├── upload.py               # /api/upload - Unified file upload & validation
    ├── timetable.py            # /api/timetable - HTML timetable parsing
    ├── seatingchart.py         # /api/seatingchart - Excel seating chart parsing
    ├── seatingarrangement.py   # /api/seatingarrangement - Seating arrangement & mismatch flow
    ├── inventory.py            # /api/inventory - QP Inventory extraction
    └── emarksheet.py           # /api/emarksheet - E-Marksheet parsing
```

---

## 4. Core Modules Breakdown

### 4.1 `main.py`
- **Application Initialization**: Configures `FastAPI(title="TestForge API", version="1.0.0")`.
- **CORS Middleware**: Allows origins configured in `settings.CORS_ORIGINS` (defaults to `http://localhost:3000` or port `4937`), with full credentials, headers, and methods enabled.
- **Router Mounting**: Mounts `routers.api_router` with prefix `/api`.
- **Health Checks**:
  - `GET /health`: Returns service status, version, and `testing_mode`.
  - `GET /`: Returns basic service info.
- **Lifespan Events**:
  - `startup`: Connects `DatabaseManager` to PostgreSQL, logs configuration and upload directory.
  - `shutdown`: Cleanly terminates connections.

### 4.2 `config.py`
- **`Settings` Class**:
  - `DATABASE_URL`: PostgreSQL connection string (defaults to local Docker instance).
  - `UPLOAD_DIR`: Local storage path for uploaded files (`uploads` or `/app/uploads`).
  - `MAX_UPLOAD_SIZE`: Maximum permitted file size (default: 10 MB = 10,485,760 bytes).
  - `APP_URL`: Next.js frontend URL (default: `http://localhost:3000` / `http://localhost:4937`).
  - `SECRET_KEY`: Internal secret key.
  - `CORS_ORIGINS`: Comma-separated list of allowed origins.
  - `TESTING` / `TEST_EXAM_CENTER_ID`: Enables testing bypass when working without active Better Auth sessions.
  - Dynamic properties: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` parsed from `DATABASE_URL`.
- **`DatabaseManager` Class**:
  - Manages SQLAlchemy `engine` with `pool_pre_ping=True` (resilient to connection drops on NeonDB).
  - Provides `@contextmanager get_session()` for automatic commit/rollback.
  - `execute_query(query, params)`: Executes raw SQL `text(query)` and returns results as list of dictionaries (`dict(row._mapping)`).
  - `execute_update(query, params)`: Executes INSERT/UPDATE/DELETE queries and returns `rowcount`.

### 4.3 `auth.py`
- **`get_exam_center_id(request: Request) -> str`**:
  - Used as a FastAPI `Depends(get_exam_center_id)` dependency across all protected routers.
  - **Testing Mode**: If `settings.TESTING == True`, immediately returns `settings.TEST_EXAM_CENTER_ID`.
  - **Production Mode**:
    1. Extracts `better-auth.session_token` cookie from the incoming request.
    2. Sends an asynchronous HTTP GET request via `httpx` to `{settings.APP_URL}/api/auth/get-session` passing the cookie.
    3. Validates that the session is active and extracts `user.id`.
    4. Executes a database query against PostgreSQL:
       ```sql
       SELECT ec.id FROM exam_centers ec
       JOIN org_members om ON om.org_id = ec.org_id
       WHERE om.user_id = :user_id
       ```
    5. Returns the associated `exam_center_id` or raises `HTTPException(401/404)`.

### 4.4 `utils.py` (File Sanitizers & Validators)
Contains specialized logic to handle messy, inconsistent MSBTE formats before parsing:
- **`validate_html_file(content, file_type)`**: Checks HTML structure and presence of session headers and table rows.
- **`validate_excel_file(content, file_type)`**: Validates workbook integrity, verifies presence of expected columns for seating charts, inventory, or marksheets.
- **`sanitize_inventory_excel(content: bytes) -> bytes`**:
  - Removes unwanted title rows, notes, and blank lines.
  - Standardizes column names: `["Sr No", "Date", "Session", "Subject Code", "Subject Name", "Total Student", "No of Packets"]`.
  - Writes cleaned output to a standardized in-memory Excel file.
- **`sanitize_seating_chart_excel(content: bytes) -> bytes`**:
  - Cleans messy multi-row student headers, merges split cells, normalizes enrollment numbers and seat numbers.
- **`sanitize_emarksheet_excel(content: bytes) -> bytes`**:
  - Detects sheet number headers, removes summary/signature rows ("Total", "Certify", "Signature").
- **`generate_stored_filename(exam_center_id, file_type, original_filename)`**: Creates unique file paths: `{exam_center_id}_{file_type}_{timestamp}_{sanitized_original_name}`.
- **`calculate_file_hash(content: bytes) -> str`**: SHA-256 checksum used to prevent duplicate uploads.

---

## 5. API Endpoints & Routers

All routers are registered under `/api`:

### 5.1 Upload Router (`/api/upload`)
- **`POST /api/upload/`**:
  - **Parameters**: `file: UploadFile`, `file_type: str`, `connected_institute_id: Optional[str]`.
  - **Allowed File Types**: `timetable`, `seatingchart`, `seatingarrangement`, `inventory`, `emarksheet`.
  - **Processing Flow**:
    1. Validates extension (`.html`/`.htm` for timetable; `.xlsx`/`.xls` for others).
    2. Enforces `MAX_UPLOAD_SIZE` (10MB).
    3. In-place sanitization via `sanitize_*_excel()`.
    4. Content validation (`validate_html_file` / `validate_excel_file`).
    5. Stores file to `settings.UPLOAD_DIR`.
    6. Performs atomic PostgreSQL `ON CONFLICT` upsert into `uploads` table:
       - Status set to `UPLOADED`.
       - Stores metadata (`uploaded_at`, `original_ext`, `connected_institute_id`, `sanitized`).
       - Returns `stored_filename`, `status`, and `file_hash`.

### 5.2 Timetable Router (`/api/timetable`)
- **`POST /api/timetable/process`**:
  - Reads uploaded timetable HTML file for the caller's `exam_center_id`.
  - Uses `BeautifulSoup4` to parse session blocks:
    - Extracts `Date` (DD-MM-YYYY), `Session` (Morning 🌅 / Afternoon 🌙), `Exam Day`.
    - Iterates table rows to extract `time_slot`, `subject_code`, `subject_name`, `schemes`.
  - Normalizes schemes (e.g. `K`, `I`, `G`, `E`).
  - Cross-references against master `subjects` table via in-memory cache to map `subject_id` and `subject_abbr`.
  - **NeonDB Free Tier Batch Optimizations**:
    - `BATCH_SIZE = 250` records.
    - `COMMIT_INTERVAL = 5` batches.
    - Atomic `ON CONFLICT (exam_center_id, date, session, subject_code, scheme)` DO UPDATE.
  - Updates `uploads` status to `PROCESSED` with `record_count`.

### 5.3 Seating Chart Router (`/api/seatingchart`)
- **`POST /api/seatingchart/process`**:
  - Payload: `{ stored_filename: str }`.
  - Loads master `subjects` scheme mapping and `connected_institutes` cache.
  - Reads Excel file using `pandas`.
  - Groups student data: `seat_number`, `enrollment_number`, `name`, `scheme`, `subjects` (abbreviations), and maps them to `sub_codes` (numeric MSBTE paper codes).
  - Batch inserts into `students` table (`BATCH_SIZE = 250`).
  - Handles conflicts on `(exam_center_id, seat_number)` by updating enrollment, name, and subject lists.

### 5.4 Seating Arrangement Router (`/api/seatingarrangement`)
- **`POST /api/seatingarrangement/process`**:
  - Processes MSBTE seating arrangement format:
    `[SR No | Seat Number | Inst Code | Course Code | Semester | Master Code | Paper Code]`.
  - Students appear multiple times (one row per paper).
  - Groups papers by student seat number.
  - **Mismatch Detection Flow**:
    - Compares uploaded papers against existing student records in the database.
    - Flags discrepancies: `missing_subjects`, `extra_subjects`, `scheme_mismatch`.
    - If mismatches exist, returns a temporary session (`temp_session_id`) with detailed mismatch reports for user resolution.
- **`POST /api/seatingarrangement/fix-mismatches`**:
  - Payload: `{ temp_session_id: str, action: "CONFIRM_FIX" | "CANCEL" }`.
  - On confirm: applies corrections to database student records in a single transaction.

### 5.5 Inventory Router (`/api/inventory`)
- **`POST /api/inventory/process`**:
  - Payload: `{ stored_filename: str }`.
  - Loads entire `timetable` cache for the exam center in a single query.
  - Uses `ThreadPoolExecutor` for parallel row processing.
  - Maps paper codes to exam date, session, and day.
  - Batch inserts into `qp_inventory` (`BATCH_SIZE = 100`):
    - `day`, `date`, `session`, `subject_code`, `expected_students`, `expected_packets`, `received_packets`, `received_qps`.
  - Conflict resolution on `(exam_center_id, date, session, subject_code)`.

### 5.6 E-Marksheet Router (`/api/emarksheet`)
- **`POST /api/emarksheet/process`**:
  - Payload: `{ stored_filename: str }`.
  - Automatically identifies header row in Excel workbook (`Sheet No.`, `Subject Name`, `Scheme`, `Subject Head`, `Paper Code`, `File Name`).
  - Filters out summary/signature rows.
  - Batch inserts into `e_marksheets` table (`BATCH_SIZE = 250`).

---

## 6. Database Performance & Optimization Patterns

1. **Connection Resilience**: `create_engine(..., pool_pre_ping=True)` ensures stale connections to NeonDB serverless compute endpoints are automatically recycled without throwing 500 errors.
2. **Chunked Processing**: Fixed small batch sizes (100–250 records) prevent query timeouts and memory exhaustion during large college data uploads (10,000+ records).
3. **Atomic UPSERT**: Every write uses PostgreSQL `ON CONFLICT (...) DO UPDATE` instead of `SELECT` + `INSERT/UPDATE` pairs, eliminating race conditions and halving database round-trips.
4. **Pre-Loaded Caching**: Processors load reference tables (`subjects`, `timetable`, `connected_institutes`) into in-memory dictionaries before looping over rows, avoiding $N+1$ query bottlenecks.
