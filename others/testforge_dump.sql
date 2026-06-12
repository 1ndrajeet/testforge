--
-- PostgreSQL database dump
--

\restrict Y7FP1ooNDofXnygC8DjFfx9bLCtymVxZjAblekn91JXuiCLavWDQTFo4KYm0Xg8

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: testforge
--

CREATE SCHEMA drizzle;


ALTER SCHEMA drizzle OWNER TO testforge;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: testforge
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


ALTER TABLE drizzle.__drizzle_migrations OWNER TO testforge;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: testforge
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNER TO testforge;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: testforge
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: account; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.account (
    id text NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id text NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp without time zone,
    refresh_token_expires_at timestamp without time zone,
    scope text,
    password text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


ALTER TABLE public.account OWNER TO testforge;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    old_values jsonb,
    new_values jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO testforge;

--
-- Name: block_allocations; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.block_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    exam_center_id uuid NOT NULL,
    date timestamp without time zone NOT NULL,
    session text NOT NULL,
    timeslot text,
    block_no text,
    block_id uuid,
    location text,
    scheme text NOT NULL,
    subject_code text NOT NULL,
    subject_name text NOT NULL,
    seat_numbers jsonb NOT NULL,
    first_seat integer,
    last_seat integer,
    assigned_count integer,
    strength integer,
    supervisor_uid text,
    supervisor_name text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.block_allocations OWNER TO testforge;

--
-- Name: blocks; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    exam_center_id uuid NOT NULL,
    location text NOT NULL,
    name text NOT NULL,
    strength integer NOT NULL,
    distribution jsonb DEFAULT '[10, 10, 10, 10]'::jsonb,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.blocks OWNER TO testforge;

--
-- Name: connected_institutes; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.connected_institutes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    exam_center_id uuid NOT NULL,
    institute_code text NOT NULL,
    institute_name text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.connected_institutes OWNER TO testforge;

--
-- Name: e_marksheets; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.e_marksheets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    exam_center_id uuid NOT NULL,
    sheet_no text,
    subject_name text,
    scheme text,
    subject_head text,
    paper_code text,
    file_name text,
    processed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.e_marksheets OWNER TO testforge;

--
-- Name: exam_centers; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.exam_centers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    address text,
    officer_incharge text,
    sealing_supervisor text,
    dist_center_code text,
    dist_center_name text,
    season text,
    exam_year integer,
    start_date timestamp without time zone,
    end_date timestamp without time zone,
    departments jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.exam_centers OWNER TO testforge;

--
-- Name: orders; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    exam_center_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    order_type text NOT NULL,
    date timestamp without time zone,
    session text,
    order_key text,
    sent_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.orders OWNER TO testforge;

--
-- Name: org_members; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.org_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.org_members OWNER TO testforge;

--
-- Name: organizations; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    subscription_tier text DEFAULT 'free'::text NOT NULL,
    subscription_expires_at timestamp without time zone,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    owner_id text NOT NULL,
    razorpay_customer_id text
);


ALTER TABLE public.organizations OWNER TO testforge;

--
-- Name: payments; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    plan_id text NOT NULL,
    plan_name text NOT NULL,
    amount integer NOT NULL,
    status text NOT NULL,
    razorpay_order_id text,
    razorpay_payment_id text,
    start_date timestamp without time zone,
    end_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.payments OWNER TO testforge;

--
-- Name: qp_inventory; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.qp_inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    exam_center_id uuid NOT NULL,
    day integer,
    date timestamp without time zone NOT NULL,
    session text NOT NULL,
    subject_code text NOT NULL,
    expected_students integer,
    expected_packets integer,
    received_packets integer DEFAULT 0,
    received_qps integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.qp_inventory OWNER TO testforge;

--
-- Name: session; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.session (
    id text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    token text NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    ip_address text,
    user_agent text,
    user_id text NOT NULL
);


ALTER TABLE public.session OWNER TO testforge;

--
-- Name: staff; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.staff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    exam_center_id uuid NOT NULL,
    uid text NOT NULL,
    name text NOT NULL,
    department text NOT NULL,
    email text,
    staff_type text NOT NULL,
    role text,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.staff OWNER TO testforge;

--
-- Name: students; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    exam_center_id uuid NOT NULL,
    connected_institute_id uuid NOT NULL,
    seat_number integer NOT NULL,
    enrollment_number text,
    name text,
    scheme text,
    subjects jsonb DEFAULT '[]'::jsonb,
    sub_codes jsonb DEFAULT '[]'::jsonb,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.students OWNER TO testforge;

--
-- Name: subjects; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.subjects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    scheme text NOT NULL,
    abbr text,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.subjects OWNER TO testforge;

--
-- Name: timetable; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.timetable (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    exam_center_id uuid NOT NULL,
    subject_id uuid,
    date timestamp without time zone NOT NULL,
    session text NOT NULL,
    time_slot text NOT NULL,
    subject_code text NOT NULL,
    subject_name text NOT NULL,
    scheme text NOT NULL,
    subject_abbr text,
    total_students integer DEFAULT 0,
    absent_numbers jsonb DEFAULT '[]'::jsonb,
    cps_students jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.timetable OWNER TO testforge;

--
-- Name: user; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public."user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    email_verified boolean NOT NULL,
    image text,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


ALTER TABLE public."user" OWNER TO testforge;

--
-- Name: verification; Type: TABLE; Schema: public; Owner: testforge
--

CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


ALTER TABLE public.verification OWNER TO testforge;

--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: testforge
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: testforge
--

COPY drizzle.__drizzle_migrations (id, hash, created_at) FROM stdin;
1	d0001cb39e8412c30fc2ea7b49aeda8e819d0d5d094bde018a606a184951efa8	1781202361025
2	8c820a266fb696d9f53d82918630a16ded28a3a941956d08deeae0d72a3cb38f	1781204292772
3	de80172e05271f4ceac5e4e9722127022a8348cc7cdd9aa660964ad31ebd3e7d	1781214251113
\.


--
-- Data for Name: account; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.account (id, account_id, provider_id, user_id, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at) FROM stdin;
UclcIALLGxM5DnmLFmm4MhENY1wnWe3j	Dt3xeLXebY4gkTWs8hZbfX2pKGwqIrtS	credential	Dt3xeLXebY4gkTWs8hZbfX2pKGwqIrtS	\N	\N	\N	\N	\N	\N	de6b64d4991ee0bcdfe64b13b0076350:18563400faab79fc83481e9f037a94bad57e0db183741a5e0e06493d988095e8b5504c94817dbb148ae8d150ce82b042b8d4903871f3e344767f95159f8b6132	2026-06-11 18:31:26.847	2026-06-11 18:31:26.847
S264pHgucOLXIJ6LoJt4wuesr9bOwWJX	jtDJOUfx9M2Kn3P41dbTL88SQKQ9Mzyb	credential	jtDJOUfx9M2Kn3P41dbTL88SQKQ9Mzyb	\N	\N	\N	\N	\N	\N	57ec828c0cc14e8166ac051d44779b2c:47c7f0eb22690183152f9335c0a6da1c9d5e29971a2f8dc20290282b22b61d146971d4ae9449dec5409517a571a4b5b9d9c9addf3e4511c0c96387cfc70bc50d	2026-06-11 21:56:02.268	2026-06-11 21:56:02.268
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.audit_logs (id, org_id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, created_at) FROM stdin;
\.


--
-- Data for Name: block_allocations; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.block_allocations (id, org_id, exam_center_id, date, session, timeslot, block_no, block_id, location, scheme, subject_code, subject_name, seat_numbers, first_seat, last_seat, assigned_count, strength, supervisor_uid, supervisor_name, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: blocks; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.blocks (id, org_id, exam_center_id, location, name, strength, distribution, is_deleted, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: connected_institutes; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.connected_institutes (id, org_id, exam_center_id, institute_code, institute_name, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: e_marksheets; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.e_marksheets (id, org_id, exam_center_id, sheet_no, subject_name, scheme, subject_head, paper_code, file_name, processed_at, created_at) FROM stdin;
\.


--
-- Data for Name: exam_centers; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.exam_centers (id, org_id, code, name, address, officer_incharge, sealing_supervisor, dist_center_code, dist_center_name, season, exam_year, start_date, end_date, departments, is_active, is_deleted, created_at, updated_at) FROM stdin;
f56f1880-7526-463f-aad8-ffc1985d4764	0f793b0b-6284-4020-89a2-e30a353fa247	1740	MMCOE	karvenagar Pune	omkar 	kulkarni	DC009	Walchand college of engineering 	Summer 2025	2026	\N	\N	[]	t	f	2026-06-11 21:58:19.907055	2026-06-11 21:58:19.907055
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.orders (id, org_id, exam_center_id, staff_id, order_type, date, session, order_key, sent_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: org_members; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.org_members (id, org_id, user_id, role, permissions, created_at, updated_at) FROM stdin;
1c776cc3-90ca-4763-8845-f562da668207	0f793b0b-6284-4020-89a2-e30a353fa247	jtDJOUfx9M2Kn3P41dbTL88SQKQ9Mzyb	owner	["*"]	2026-06-11 21:56:29.986991	2026-06-11 21:56:29.986991
\.


--
-- Data for Name: organizations; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.organizations (id, name, slug, subscription_tier, subscription_expires_at, settings, created_at, updated_at, owner_id, razorpay_customer_id) FROM stdin;
0f793b0b-6284-4020-89a2-e30a353fa247	Marathwada Mitra Mandals College of engineering 	mmcoe	premium	2027-06-11 22:07:03.954	{}	2026-06-11 21:56:29.981512	2026-06-11 22:07:03.959	jtDJOUfx9M2Kn3P41dbTL88SQKQ9Mzyb	\N
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.payments (id, org_id, plan_id, plan_name, amount, status, razorpay_order_id, razorpay_payment_id, start_date, end_date, created_at) FROM stdin;
05d941da-4e23-4221-ac8f-7729f1f2123c	0f793b0b-6284-4020-89a2-e30a353fa247	semester_online	Semester (Online)	289900	pending	order_1781215103860_q2lg1y2s7	\N	\N	\N	2026-06-11 21:58:23.861266
cdfa65c1-cf2c-4d97-873f-e3f4cb04fba7	0f793b0b-6284-4020-89a2-e30a353fa247	lifetime_access	lifetime access	3000000	pending	order_T0TzGrzLqzgvHm	\N	\N	\N	2026-06-11 22:05:17.037978
e97817f0-b268-4070-9a51-f4bd0b6eff35	0f793b0b-6284-4020-89a2-e30a353fa247	1year_online	1year	550000	paid	order_T0U0U3CKQXpt4P	pay_T0U0r798BgW7hs	2026-06-11 22:07:03.954	2027-06-11 22:07:03.954	2026-06-11 22:06:25.844395
\.


--
-- Data for Name: qp_inventory; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.qp_inventory (id, org_id, exam_center_id, day, date, session, subject_code, expected_students, expected_packets, received_packets, received_qps, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.session (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id) FROM stdin;
8Z9naaBEnhu91chq8PxNqVJPksoX7mSz	2026-06-18 21:56:02.278	sea42V6wkELXh7oUFTTqkqgG4rtxJMiu	2026-06-11 21:56:02.278	2026-06-11 21:56:02.278	127.0.0.1	Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0	jtDJOUfx9M2Kn3P41dbTL88SQKQ9Mzyb
\.


--
-- Data for Name: staff; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.staff (id, org_id, exam_center_id, uid, name, department, email, staff_type, role, is_deleted, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: students; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.students (id, org_id, exam_center_id, connected_institute_id, seat_number, enrollment_number, name, scheme, subjects, sub_codes, is_deleted, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: subjects; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.subjects (id, org_id, code, name, scheme, abbr, is_deleted, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: timetable; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.timetable (id, org_id, exam_center_id, subject_id, date, session, time_slot, subject_code, subject_name, scheme, subject_abbr, total_students, absent_numbers, cps_students, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public."user" (id, name, email, email_verified, image, created_at, updated_at) FROM stdin;
Dt3xeLXebY4gkTWs8hZbfX2pKGwqIrtS	Bruce Wayne	bruce@testforge.dev	f	\N	2026-06-11 18:31:26.821	2026-06-11 18:31:26.821
jtDJOUfx9M2Kn3P41dbTL88SQKQ9Mzyb	omkar kulkarni	omkar@me.com	f	\N	2026-06-11 21:56:02.249	2026-06-11 21:56:02.249
\.


--
-- Data for Name: verification; Type: TABLE DATA; Schema: public; Owner: testforge
--

COPY public.verification (id, identifier, value, expires_at, created_at, updated_at) FROM stdin;
\.


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: testforge
--

SELECT pg_catalog.setval('drizzle.__drizzle_migrations_id_seq', 3, true);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: testforge
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: block_allocations block_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.block_allocations
    ADD CONSTRAINT block_allocations_pkey PRIMARY KEY (id);


--
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (id);


--
-- Name: connected_institutes connected_institutes_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.connected_institutes
    ADD CONSTRAINT connected_institutes_pkey PRIMARY KEY (id);


--
-- Name: e_marksheets e_marksheets_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.e_marksheets
    ADD CONSTRAINT e_marksheets_pkey PRIMARY KEY (id);


--
-- Name: exam_centers exam_centers_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.exam_centers
    ADD CONSTRAINT exam_centers_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: org_members org_members_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_unique; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_unique UNIQUE (slug);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: qp_inventory qp_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.qp_inventory
    ADD CONSTRAINT qp_inventory_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_unique; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_unique UNIQUE (token);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);


--
-- Name: timetable timetable_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.timetable
    ADD CONSTRAINT timetable_pkey PRIMARY KEY (id);


--
-- Name: user user_email_unique; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_unique UNIQUE (email);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: alloc_block_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX alloc_block_idx ON public.block_allocations USING btree (block_id);


--
-- Name: alloc_date_session_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX alloc_date_session_idx ON public.block_allocations USING btree (date, session);


--
-- Name: alloc_org_date_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX alloc_org_date_idx ON public.block_allocations USING btree (org_id, date);


--
-- Name: alloc_unique_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE UNIQUE INDEX alloc_unique_idx ON public.block_allocations USING btree (exam_center_id, date, session, block_id, subject_code);


--
-- Name: audit_entity_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX audit_entity_idx ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: audit_org_time_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX audit_org_time_idx ON public.audit_logs USING btree (org_id, created_at);


--
-- Name: blocks_center_location_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE UNIQUE INDEX blocks_center_location_idx ON public.blocks USING btree (exam_center_id, location);


--
-- Name: blocks_org_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX blocks_org_idx ON public.blocks USING btree (org_id);


--
-- Name: connected_inst_center_inst_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE UNIQUE INDEX connected_inst_center_inst_idx ON public.connected_institutes USING btree (exam_center_id, institute_code);


--
-- Name: emarksheets_org_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX emarksheets_org_idx ON public.e_marksheets USING btree (org_id);


--
-- Name: emarksheets_paper_code_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX emarksheets_paper_code_idx ON public.e_marksheets USING btree (paper_code);


--
-- Name: exam_centers_org_code_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE UNIQUE INDEX exam_centers_org_code_idx ON public.exam_centers USING btree (org_id, code);


--
-- Name: exam_centers_org_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX exam_centers_org_idx ON public.exam_centers USING btree (org_id);


--
-- Name: orders_date_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX orders_date_idx ON public.orders USING btree (date);


--
-- Name: orders_org_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX orders_org_idx ON public.orders USING btree (org_id);


--
-- Name: orders_staff_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX orders_staff_idx ON public.orders USING btree (staff_id);


--
-- Name: org_members_org_user_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE UNIQUE INDEX org_members_org_user_idx ON public.org_members USING btree (org_id, user_id);


--
-- Name: payments_org_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX payments_org_idx ON public.payments USING btree (org_id);


--
-- Name: payments_payment_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE UNIQUE INDEX payments_payment_idx ON public.payments USING btree (razorpay_payment_id);


--
-- Name: qp_date_subject_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE UNIQUE INDEX qp_date_subject_idx ON public.qp_inventory USING btree (exam_center_id, date, session, subject_code);


--
-- Name: qp_org_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX qp_org_idx ON public.qp_inventory USING btree (org_id);


--
-- Name: staff_center_uid_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE UNIQUE INDEX staff_center_uid_idx ON public.staff USING btree (exam_center_id, uid);


--
-- Name: staff_org_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX staff_org_idx ON public.staff USING btree (org_id);


--
-- Name: staff_type_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX staff_type_idx ON public.staff USING btree (staff_type);


--
-- Name: students_center_seat_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE UNIQUE INDEX students_center_seat_idx ON public.students USING btree (exam_center_id, seat_number);


--
-- Name: students_enrollment_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX students_enrollment_idx ON public.students USING btree (enrollment_number);


--
-- Name: students_org_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX students_org_idx ON public.students USING btree (org_id);


--
-- Name: subjects_org_code_scheme_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE UNIQUE INDEX subjects_org_code_scheme_idx ON public.subjects USING btree (org_id, code, scheme);


--
-- Name: subjects_org_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX subjects_org_idx ON public.subjects USING btree (org_id);


--
-- Name: tt_center_date_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX tt_center_date_idx ON public.timetable USING btree (exam_center_id, date);


--
-- Name: tt_date_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE INDEX tt_date_idx ON public.timetable USING btree (date);


--
-- Name: tt_unique_idx; Type: INDEX; Schema: public; Owner: testforge
--

CREATE UNIQUE INDEX tt_unique_idx ON public.timetable USING btree (exam_center_id, date, session, subject_code, scheme);


--
-- Name: account account_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: block_allocations block_allocations_block_id_blocks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.block_allocations
    ADD CONSTRAINT block_allocations_block_id_blocks_id_fk FOREIGN KEY (block_id) REFERENCES public.blocks(id);


--
-- Name: block_allocations block_allocations_exam_center_id_exam_centers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.block_allocations
    ADD CONSTRAINT block_allocations_exam_center_id_exam_centers_id_fk FOREIGN KEY (exam_center_id) REFERENCES public.exam_centers(id) ON DELETE CASCADE;


--
-- Name: block_allocations block_allocations_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.block_allocations
    ADD CONSTRAINT block_allocations_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: blocks blocks_exam_center_id_exam_centers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_exam_center_id_exam_centers_id_fk FOREIGN KEY (exam_center_id) REFERENCES public.exam_centers(id) ON DELETE CASCADE;


--
-- Name: blocks blocks_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: connected_institutes connected_institutes_exam_center_id_exam_centers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.connected_institutes
    ADD CONSTRAINT connected_institutes_exam_center_id_exam_centers_id_fk FOREIGN KEY (exam_center_id) REFERENCES public.exam_centers(id) ON DELETE CASCADE;


--
-- Name: connected_institutes connected_institutes_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.connected_institutes
    ADD CONSTRAINT connected_institutes_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: e_marksheets e_marksheets_exam_center_id_exam_centers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.e_marksheets
    ADD CONSTRAINT e_marksheets_exam_center_id_exam_centers_id_fk FOREIGN KEY (exam_center_id) REFERENCES public.exam_centers(id) ON DELETE CASCADE;


--
-- Name: e_marksheets e_marksheets_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.e_marksheets
    ADD CONSTRAINT e_marksheets_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: exam_centers exam_centers_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.exam_centers
    ADD CONSTRAINT exam_centers_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: orders orders_exam_center_id_exam_centers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_exam_center_id_exam_centers_id_fk FOREIGN KEY (exam_center_id) REFERENCES public.exam_centers(id) ON DELETE CASCADE;


--
-- Name: orders orders_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: orders orders_staff_id_staff_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_staff_id_staff_id_fk FOREIGN KEY (staff_id) REFERENCES public.staff(id);


--
-- Name: org_members org_members_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_members org_members_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.org_members
    ADD CONSTRAINT org_members_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_owner_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_owner_id_user_id_fk FOREIGN KEY (owner_id) REFERENCES public."user"(id);


--
-- Name: payments payments_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: qp_inventory qp_inventory_exam_center_id_exam_centers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.qp_inventory
    ADD CONSTRAINT qp_inventory_exam_center_id_exam_centers_id_fk FOREIGN KEY (exam_center_id) REFERENCES public.exam_centers(id) ON DELETE CASCADE;


--
-- Name: qp_inventory qp_inventory_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.qp_inventory
    ADD CONSTRAINT qp_inventory_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: session session_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: staff staff_exam_center_id_exam_centers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_exam_center_id_exam_centers_id_fk FOREIGN KEY (exam_center_id) REFERENCES public.exam_centers(id) ON DELETE CASCADE;


--
-- Name: staff staff_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: students students_connected_institute_id_connected_institutes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_connected_institute_id_connected_institutes_id_fk FOREIGN KEY (connected_institute_id) REFERENCES public.connected_institutes(id) ON DELETE CASCADE;


--
-- Name: students students_exam_center_id_exam_centers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_exam_center_id_exam_centers_id_fk FOREIGN KEY (exam_center_id) REFERENCES public.exam_centers(id) ON DELETE CASCADE;


--
-- Name: students students_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: subjects subjects_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: timetable timetable_exam_center_id_exam_centers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.timetable
    ADD CONSTRAINT timetable_exam_center_id_exam_centers_id_fk FOREIGN KEY (exam_center_id) REFERENCES public.exam_centers(id) ON DELETE CASCADE;


--
-- Name: timetable timetable_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.timetable
    ADD CONSTRAINT timetable_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: timetable timetable_subject_id_subjects_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: testforge
--

ALTER TABLE ONLY public.timetable
    ADD CONSTRAINT timetable_subject_id_subjects_id_fk FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- PostgreSQL database dump complete
--

\unrestrict Y7FP1ooNDofXnygC8DjFfx9bLCtymVxZjAblekn91JXuiCLavWDQTFo4KYm0Xg8

