import csv
from sqlalchemy import create_engine, text

DATABASE_URL = "postgresql://testforge:tfg_G8xR7vN2mK4pY9qW6dC1sH5uJ3aL8e@localhost:5433/testforge"

CSV_FILE = "subject-abbr.csv"

CHECK_SQL = """
SELECT id
FROM subjects
WHERE code = :code
AND scheme = :scheme
LIMIT 1
"""

INSERT_SQL = """
INSERT INTO subjects (
    code,
    name,
    scheme,
    abbr,
    is_deleted
)
VALUES (
    :code,
    :name,
    :scheme,
    :abbr,
    FALSE
)
"""

UPDATE_SQL = """
UPDATE subjects
SET
    name = :name,
    abbr = :abbr,
    updated_at = NOW()
WHERE code = :code
AND scheme = :scheme
"""

engine = create_engine(DATABASE_URL)

inserted = 0
updated = 0
skipped = 0

with engine.begin() as conn:
    with open(CSV_FILE, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            abbr = (row.get("suggested_abbr") or "").strip()

            if not abbr or abbr.upper() == "NULL":
                skipped += 1
                continue

            code = row["subject_code"].strip()
            name = row["subject_name"].strip()

            schemes = [
                s.strip()
                for s in row["missing_schemes"].split(",")
                if s.strip()
            ]

            for scheme in schemes:
                exists = conn.execute(
                    text(CHECK_SQL),
                    {
                        "code": code,
                        "scheme": scheme,
                    },
                ).fetchone()

                if exists:
                    conn.execute(
                        text(UPDATE_SQL),
                        {
                            "code": code,
                            "scheme": scheme,
                            "name": name,
                            "abbr": abbr,
                        },
                    )
                    updated += 1
                else:
                    conn.execute(
                        text(INSERT_SQL),
                        {
                            "code": code,
                            "scheme": scheme,
                            "name": name,
                            "abbr": abbr,
                        },
                    )
                    inserted += 1

print("=" * 50)
print(f"Inserted : {inserted}")
print(f"Updated  : {updated}")
print(f"Skipped  : {skipped}")
print("=" * 50)