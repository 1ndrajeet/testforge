-- ============================================================================
-- TestForge v1.2 — Complete Schema (0001_init.sql)
-- Full schema, RLS policies, Storage buckets, triggers, subscription columns
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- Enable required extensions
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- 1. MASTER TABLES
-- ─────────────────────────────────────────────────────────────

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  scheme text not null,
  abbr text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code, scheme)
);

-- ─────────────────────────────────────────────────────────────
-- 2. EXAM CENTERS (owned directly by auth.users)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.exam_centers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  address text,
  officer_incharge text,
  sealing_supervisor text,
  exam_controller text,
  dist_center_code text,
  dist_center_name text,
  season text,
  exam_year integer,
  start_date timestamptz,
  end_date timestamptz,
  departments jsonb default '[]'::jsonb,
  is_active boolean default true,
  is_deleted boolean not null default false,
  -- subscription state (added in later migration)
  subscription_tier text not null default 'inactive',
  subscription_expires_at timestamptz,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure subscription columns exist even if the table was created earlier
alter table public.exam_centers
  add column if not exists subscription_tier text not null default 'inactive',
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz;

create unique index if not exists exam_centers_owner_active_uidx
  on public.exam_centers(owner_id)
  where is_active and not is_deleted;

-- ─────────────────────────────────────────────────────────────
-- 3. PROMO CODES (referenced by payments)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null,
  duration_days int4 not null default 60,
  amount int4 not null default 100,
  is_used bool default false,
  used_by_center_id uuid,
  used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Migrate legacy column name if it exists
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'promo_codes'
      and column_name = 'used_by_org_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'promo_codes'
      and column_name = 'used_by_center_id'
  ) then
    alter table public.promo_codes
      rename column used_by_org_id to used_by_center_id;
  end if;
end $$;

-- FK to exam_centers (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'promo_codes_used_by_center_fk'
  ) then
    alter table public.promo_codes
      add constraint promo_codes_used_by_center_fk
      foreign key (used_by_center_id)
      references public.exam_centers(id) on delete set null;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4. PAYMENTS
-- ─────────────────────────────────────────────────────────────

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  exam_center_id uuid not null references public.exam_centers(id) on delete cascade,
  plan_id text not null,
  plan_name text not null,
  amount integer not null,                    -- in paise
  currency text not null default 'INR',
  status text not null default 'pending',     -- pending | paid | failed | refunded
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  promo_code_id uuid references public.promo_codes(id) on delete set null,
  start_date timestamptz,
  end_date timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payments
  add column if not exists promo_code_id uuid
  references public.promo_codes(id) on delete set null;

create index if not exists payments_center_idx on public.payments(exam_center_id);
create index if not exists payments_order_idx on public.payments(razorpay_order_id);

-- ─────────────────────────────────────────────────────────────
-- 5. OPERATIONAL TABLES
-- ─────────────────────────────────────────────────────────────

create table if not exists public.connected_institutes (
  id uuid primary key default gen_random_uuid(),
  exam_center_id uuid not null references public.exam_centers(id) on delete cascade,
  institute_code text not null,
  institute_name text not null,
  is_active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_center_id, institute_code)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  exam_center_id uuid not null references public.exam_centers(id) on delete cascade,
  connected_institute_id uuid not null references public.connected_institutes(id) on delete cascade,
  seat_number integer not null,
  seat_number_text text generated always as (seat_number::text) stored,
  institute_code text,
  enrollment_number text,
  name text,
  scheme text,
  subjects jsonb default '[]'::jsonb,
  sub_codes jsonb default '[]'::jsonb,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_center_id, seat_number)
);

create index if not exists students_enrollment_idx on public.students(enrollment_number);
create index if not exists students_center_scheme_idx on public.students(exam_center_id, scheme, is_deleted);
create index if not exists students_seat_number_text_idx on public.students(seat_number_text);

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  exam_center_id uuid not null references public.exam_centers(id) on delete cascade,
  uid text not null,
  name text not null,
  department text not null,
  email text,
  staff_type text not null,
  role text,
  designation text,
  post_held_in_examination text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_center_id, uid)
);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  exam_center_id uuid not null references public.exam_centers(id) on delete cascade,
  block_no text not null,
  location text not null,
  name text not null,
  strength integer not null,
  distribution jsonb default '[10,10,10,10]'::jsonb,
  template integer default 1,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_center_id, location)
);

create table if not exists public.timetable (
  id uuid primary key default gen_random_uuid(),
  exam_center_id uuid not null references public.exam_centers(id) on delete cascade,
  subject_id uuid references public.subjects(id),
  exam_day integer,
  date timestamptz not null,
  session text not null,
  time_slot text not null,
  subject_code text not null,
  subject_name text not null,
  scheme text not null,
  subject_abbr text,
  total_students integer default 0,
  absent_numbers jsonb default '[]'::jsonb,
  cps_students jsonb default '[]'::jsonb,
  cps_resolved jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_center_id, date, session, subject_code, scheme)
);

create index if not exists timetable_center_date_session_idx
  on public.timetable(exam_center_id, date, session);

create table if not exists public.block_allocations (
  id uuid primary key default gen_random_uuid(),
  exam_center_id uuid not null references public.exam_centers(id) on delete cascade,
  connected_institute_id uuid references public.connected_institutes(id) on delete set null,
  date timestamptz not null,
  session text not null,
  timeslot text,
  block_id uuid references public.blocks(id),
  block_no text,
  location text,
  scheme text not null,
  subject_code text not null,
  subject_name text not null,
  seat_numbers jsonb not null,
  first_seat integer,
  last_seat integer,
  assigned_count integer,
  strength integer,
  supervisor_uid text,
  supervisor_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_center_id, date, session, block_id, subject_code)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  exam_center_id uuid not null references public.exam_centers(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  order_type text not null,
  date timestamptz,
  session text,
  order_key text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.e_marksheets (
  id uuid primary key default gen_random_uuid(),
  exam_center_id uuid not null references public.exam_centers(id) on delete cascade,
  sheet_no text,
  subject_name text,
  scheme text,
  subject_head text,
  paper_code text,
  file_name text,
  processed_at timestamptz default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.qp_inventory (
  id uuid primary key default gen_random_uuid(),
  exam_center_id uuid not null references public.exam_centers(id) on delete cascade,
  day integer,
  date timestamptz,
  session text,
  subject_code text,
  expected_students integer,
  expected_packets integer,
  received_packets integer,
  received_qps integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_center_id, date, session, subject_code)
);

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  exam_center_id uuid not null references public.exam_centers(id) on delete cascade,
  file_type text not null,
  original_filename text,
  stored_filename text,
  file_hash text,
  file_size integer,
  status text not null default 'UPLOADED',
  record_count integer,
  error_message text,
  metadata jsonb default '{}'::jsonb,
  connected_institute_id uuid references public.connected_institutes(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_center_id, file_type, connected_institute_id)
);

create unique index if not exists uploads_center_type_inst_not_null_idx 
  on public.uploads (exam_center_id, file_type, connected_institute_id) 
  where connected_institute_id is not null;

create unique index if not exists uploads_center_type_inst_null_idx 
  on public.uploads (exam_center_id, file_type) 
  where connected_institute_id is null;


create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  exam_center_id uuid not null references public.exam_centers(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  recipient_email text,
  recipient_name text,
  subject text,
  order_type text,
  order_key text,
  status text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────

-- Helper: does the current user own this exam center?
create or replace function public.user_owns_exam_center(ec uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.exam_centers
    where id = ec
      and owner_id = auth.uid()
      and is_active
      and not is_deleted
  );
$$;

-- exam_centers
alter table public.exam_centers enable row level security;

drop policy if exists "ec_select_own" on public.exam_centers;
drop policy if exists "ec_insert_own" on public.exam_centers;
drop policy if exists "ec_update_own" on public.exam_centers;
drop policy if exists "ec_delete_own" on public.exam_centers;

create policy "ec_select_own" on public.exam_centers
  for select using (owner_id = auth.uid());
create policy "ec_insert_own" on public.exam_centers
  for insert with check (owner_id = auth.uid());
create policy "ec_update_own" on public.exam_centers
  for update using (owner_id = auth.uid());
create policy "ec_delete_own" on public.exam_centers
  for delete using (owner_id = auth.uid());

-- subjects
alter table public.subjects enable row level security;

drop policy if exists "subjects_read_all" on public.subjects;
drop policy if exists "subjects_write_auth" on public.subjects;

create policy "subjects_read_all" on public.subjects
  for select using (true);
create policy "subjects_write_auth" on public.subjects
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- audit_logs
alter table public.audit_logs enable row level security;

drop policy if exists "audit_read_own" on public.audit_logs;
drop policy if exists "audit_insert_auth" on public.audit_logs;

create policy "audit_read_own" on public.audit_logs
  for select using (user_id = auth.uid());
create policy "audit_insert_auth" on public.audit_logs
  for insert with check (auth.role() = 'authenticated');

-- Tenant-scoped tables: macro block
do $$
declare
  t text;
  tables text[] := array[
    'connected_institutes','students','staff','blocks','timetable',
    'block_allocations','orders','e_marksheets','qp_inventory','uploads',
    'email_logs','payments'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    execute format(
      'create policy %I on public.%I for select using (public.user_owns_exam_center(exam_center_id))',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert with check (public.user_owns_exam_center(exam_center_id))',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update using (public.user_owns_exam_center(exam_center_id))',
      t || '_update', t
    );
    execute format(
      'create policy %I on public.%I for delete using (public.user_owns_exam_center(exam_center_id))',
      t || '_delete', t
    );
  end loop;
end $$;

-- promo_codes: read-only for authenticated users; writes go through RPC
alter table public.promo_codes enable row level security;
drop policy if exists "promo_read_auth" on public.promo_codes;
create policy "promo_read_auth" on public.promo_codes
  for select using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────
-- 7. STORAGE BUCKET + POLICIES
-- ─────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

drop policy if exists "uploads_read_own" on storage.objects;
drop policy if exists "uploads_write_own" on storage.objects;
drop policy if exists "uploads_delete_own" on storage.objects;

create policy "uploads_read_own" on storage.objects for select
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.exam_centers where owner_id = auth.uid()
    )
  );

create policy "uploads_write_own" on storage.objects for insert
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.exam_centers where owner_id = auth.uid()
    )
  );

create policy "uploads_delete_own" on storage.objects for delete
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.exam_centers where owner_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 8. UPDATED_AT TRIGGER
-- ─────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
  tables text[] := array[
    'subjects','exam_centers','payments','connected_institutes','students',
    'staff','blocks','timetable','block_allocations','orders',
    'qp_inventory','uploads'
  ];
begin
  foreach t in array tables loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'trg_' || t || '_updated', t
    );
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      'trg_' || t || '_updated', t
    );
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 9. PROMO REDEMPTION RPC (security definer)
-- ─────────────────────────────────────────────────────────────

create or replace function public.redeem_promo(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo record;
  v_center_id uuid;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;

  select id into v_center_id
  from public.exam_centers
  where owner_id = auth.uid() and is_active and not is_deleted
  limit 1;

  if v_center_id is null then
    return jsonb_build_object('success', false, 'error', 'No exam center for this user');
  end if;

  select * into v_promo
  from public.promo_codes
  where code = upper(p_code)
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Invalid promo code');
  end if;

  if v_promo.is_used then
    return jsonb_build_object('success', false, 'error', 'Promo code already used');
  end if;

  if v_promo.expires_at is not null and v_promo.expires_at < v_now then
    return jsonb_build_object('success', false, 'error', 'Promo code expired');
  end if;

  update public.promo_codes
  set is_used = true, used_by_center_id = v_center_id, used_at = v_now
  where id = v_promo.id;

  return jsonb_build_object(
    'success', true,
    'promoId', v_promo.id,
    'code', v_promo.code,
    'type', v_promo.type,
    'durationDays', v_promo.duration_days,
    'amount', v_promo.amount
  );
end;
$$;

grant execute on function public.redeem_promo(text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 10. VALIDATION — prints one row per check
-- ─────────────────────────────────────────────────────────────

select 'table:exam_centers' as check_name,
       exists (select 1 from information_schema.tables
         where table_schema='public' and table_name='exam_centers') as ok
union all
select 'table:payments',
  exists (select 1 from information_schema.tables
    where table_schema='public' and table_name='payments')
union all
select 'table:promo_codes',
  exists (select 1 from information_schema.tables
    where table_schema='public' and table_name='promo_codes')
union all
select 'col:exam_centers.subscription_tier',
  exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='exam_centers' and column_name='subscription_tier')
union all
select 'col:exam_centers.subscription_expires_at',
  exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='exam_centers' and column_name='subscription_expires_at')
union all
select 'col:exam_centers.trial_started_at',
  exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='exam_centers' and column_name='trial_started_at')
union all
select 'col:exam_centers.trial_ends_at',
  exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='exam_centers' and column_name='trial_ends_at')
union all
select 'col:payments.promo_code_id',
  exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='payments' and column_name='promo_code_id')
union all
select 'col:promo_codes.used_by_center_id',
  exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='promo_codes' and column_name='used_by_center_id')
union all
select 'fk:promo_codes_used_by_center_fk',
  exists (select 1 from pg_constraint where conname='promo_codes_used_by_center_fk')
union all
select 'rls:promo_read_auth',
  exists (select 1 from pg_policies
    where schemaname='public' and tablename='promo_codes' and policyname='promo_read_auth')
union all
select 'fn:user_owns_exam_center',
  exists (select 1 from pg_proc where proname='user_owns_exam_center')
union all
select 'fn:redeem_promo',
  exists (select 1 from pg_proc where proname='redeem_promo')
union all
select 'fn:set_updated_at',
  exists (select 1 from pg_proc where proname='set_updated_at')
union all
select 'fn:get_exam_center_schemes',
  exists (select 1 from pg_proc where proname='get_exam_center_schemes')
union all
select 'fn:get_seating_chart_institutes',
  exists (select 1 from pg_proc where proname='get_seating_chart_institutes')
union all
select 'bucket:uploads',
  exists (select 1 from storage.buckets where id='uploads')
order by check_name;

drop policy if exists "promo_update_own_redemption" on public.promo_codes;
create policy "promo_update_own_redemption" on public.promo_codes
for update
using (
  is_used = false
  and exists (select 1 from public.exam_centers
              where owner_id = auth.uid() and is_active and not is_deleted)
)
with check (
  is_used = true
  and used_by_center_id in (
    select id from public.exam_centers where owner_id = auth.uid()
  )
);

-- Distinct student schemes for an exam center
create or replace function public.get_exam_center_schemes(p_exam_center_id uuid)
returns table(scheme text)
language sql stable
security invoker
as $$
  select distinct s.scheme
  from public.students s
  where s.exam_center_id = p_exam_center_id
    and not s.is_deleted
    and s.scheme is not null
  order by s.scheme;
$$;
grant execute on function public.get_exam_center_schemes(uuid) to authenticated, anon;

-- Seating chart connected institutes with student counts for an exam center
create or replace function public.get_seating_chart_institutes(p_exam_center_id uuid)
returns table(
  code text,
  name text,
  count bigint
)
language sql stable
security invoker
as $$
  select
    ci.institute_code as code,
    ci.institute_name as name,
    count(s.id) as count
  from public.connected_institutes ci
  left join public.students s
    on s.connected_institute_id = ci.id
    and not s.is_deleted
    and s.exam_center_id = p_exam_center_id
  where ci.exam_center_id = p_exam_center_id
    and ci.is_active
  group by ci.id, ci.institute_code, ci.institute_name
  order by ci.institute_code;
$$;
grant execute on function public.get_seating_chart_institutes(uuid) to authenticated, anon;


-- supabase/migrations/xxxx_email_logs_retry_columns.sql
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS attempts   integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS message_id text;

CREATE INDEX IF NOT EXISTS email_logs_status_idx
  ON public.email_logs (exam_center_id, status, created_at DESC);