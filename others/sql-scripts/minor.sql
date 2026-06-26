---- Missing subject mappings for that specific center:

SELECT DISTINCT
    t.subject_code,
    t.subject_name,
    t.scheme
FROM timetable t
WHERE t.exam_center_id = '34e9fc9e-b946-4e47-86e1-36f1f6fe5cce'
  AND t.subject_abbr IS NULL
ORDER BY t.subject_code, t.scheme;



---- Find exact (code, scheme) combinations missing from subjects:

SELECT DISTINCT
    t.subject_code,
    t.subject_name,
    t.scheme
FROM timetable t
LEFT JOIN subjects s
       ON s.code = t.subject_code
      AND s.scheme = t.scheme
      AND s.is_deleted = FALSE
WHERE t.exam_center_id = '34e9fc9e-b946-4e47-86e1-36f1f6fe5cce'
  AND s.id IS NULL
ORDER BY t.subject_code, t.scheme;

WITH missing_subjects AS (
    SELECT DISTINCT
        t.subject_code,
        t.subject_name,
        t.scheme
    FROM timetable t
    LEFT JOIN subjects s
        ON s.code = t.subject_code
       AND s.scheme = t.scheme
       AND s.is_deleted = FALSE
    WHERE t.exam_center_id = '34e9fc9e-b946-4e47-86e1-36f1f6fe5cce'
      AND s.id IS NULL
)

SELECT
    ms.subject_code,
    ms.subject_name,
    STRING_AGG(DISTINCT ms.scheme, ', ' ORDER BY ms.scheme) AS missing_schemes,

    COALESCE(
        (
            SELECT STRING_AGG(DISTINCT s1.abbr, ', ' ORDER BY s1.abbr)
            FROM subjects s1
            WHERE s1.code = ms.subject_code
              AND s1.is_deleted = FALSE
              AND s1.abbr IS NOT NULL
              AND TRIM(s1.abbr) <> ''
        ),
        (
            SELECT STRING_AGG(DISTINCT s2.abbr, ', ' ORDER BY s2.abbr)
            FROM subjects s2
            WHERE UPPER(TRIM(s2.name)) = UPPER(TRIM(ms.subject_name))
              AND s2.is_deleted = FALSE
              AND s2.abbr IS NOT NULL
              AND TRIM(s2.abbr) <> ''
        )
    ) AS suggested_abbr

FROM missing_subjects ms
GROUP BY
    ms.subject_code,
    ms.subject_name
ORDER BY
    ms.subject_code;