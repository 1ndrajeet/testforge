-- -------------------------------------------------------------
-- -------------------------------------------------------------
-- TablePlus 1.6.3
--
-- https://tableplus.com/
--
-- Database: testforge
-- Generation Time: 2026-07-03 17:37:39.065749
-- -------------------------------------------------------------

-- This script only contains the table creation statements and does not fully represent the table in database. It's still missing: indices, triggers. Do not use it as backup.

-- Table Definition
-- CREATE TABLE "public"."promo_codes" (
--     "id" uuid NOT NULL DEFAULT gen_random_uuid(),
--     "code" text NOT NULL,
--     "type" text NOT NULL,
--     "duration_days" int4 NOT NULL DEFAULT 60,
--     "amount" int4 NOT NULL DEFAULT 100,
--     "is_used" bool DEFAULT false,
--     "used_by_org_id" uuid,
--     "used_at" timestamp,
--     "expires_at" timestamp,
--     "created_at" timestamp NOT NULL DEFAULT now(),
--     PRIMARY KEY ("id")
-- );

INSERT INTO public.promo_codes (
    code,
    type,
    duration_days,
    amount,
    expires_at
)
VALUES
('EARLYACCESS2026','trial_60day',60,100,'2026-12-31 00:00:00'),
('FOUNDER60','trial_60day',60,100,'2026-12-31 00:00:00'),
('LAUNCH60','trial_60day',60,100,'2026-12-31 00:00:00'),
('TESTFORGE60','trial_60day',60,100,'2026-12-31 00:00:00'),
('MSBTE60','trial_60day',60,100,'2026-12-31 00:00:00');

