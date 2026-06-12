import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ============================================
// BetterAuth Schema
// ============================================

export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const sessions = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const verifications = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const orgMembers = pgTable(
  'org_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    permissions: jsonb('permissions').$type<string[]>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    orgUserIdx: uniqueIndex('org_members_org_user_idx').on(table.orgId, table.userId),
  })
);

// ============================================
// Subjects Master
// ============================================
export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    scheme: text('scheme').notNull(),
    abbr: text('abbr'),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    codeSchemeIdx: uniqueIndex('subjects_code_scheme_idx').on(table.code, table.scheme),
  })
);

// ============================================
// Exam Centers
// ============================================

export const examCenters = pgTable(
  'exam_centers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    address: text('address'),
    officerIncharge: text('officer_incharge'),
    sealingSupervisor: text('sealing_supervisor'),
    distCenterCode: text('dist_center_code'),
    distCenterName: text('dist_center_name'),
    season: text('season'),
    examYear: integer('exam_year'),
    startDate: timestamp('start_date'),
    endDate: timestamp('end_date'),
    departments: jsonb('departments').$type<string[]>().default([]),
    isActive: boolean('is_active').default(true),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    orgCodeIdx: uniqueIndex('exam_centers_org_code_idx').on(table.orgId, table.code),
    orgIdx: index('exam_centers_org_idx').on(table.orgId),
  })
);

// ============================================
// Connected Institutes
// ============================================

export const connectedInstitutes = pgTable(
  'connected_institutes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    examCenterId: uuid('exam_center_id')
      .notNull()
      .references(() => examCenters.id, { onDelete: 'cascade' }),
    instituteCode: text('institute_code').notNull(),
    instituteName: text('institute_name').notNull(),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    centerInstituteIdx: uniqueIndex('connected_inst_center_inst_idx').on(
      table.examCenterId,
      table.instituteCode
    ),
  })
);

// ============================================
// Timetable (with duplicate protection)
// ============================================

export const timetable = pgTable(
  'timetable',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    examCenterId: uuid('exam_center_id')
      .notNull()
      .references(() => examCenters.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').references(() => subjects.id),
    date: timestamp('date').notNull(),
    session: text('session').notNull(),
    timeSlot: text('time_slot').notNull(),
    subjectCode: text('subject_code').notNull(),
    subjectName: text('subject_name').notNull(),
    scheme: text('scheme').notNull(),
    subjectAbbr: text('subject_abbr'),
    totalStudents: integer('total_students').default(0),
    absentNumbers: jsonb('absent_numbers').$type<number[]>().default([]),
    cpsStudents: jsonb('cps_students').$type<number[]>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueIdx: uniqueIndex('tt_unique_idx').on(
      table.examCenterId,
      table.date,
      table.session,
      table.subjectCode,
      table.scheme
    ),
    dateIdx: index('tt_date_idx').on(table.date),
    centerDateIdx: index('tt_center_date_idx').on(table.examCenterId, table.date),
  })
);

// ============================================
// Students
// ============================================

export const students = pgTable(
  'students',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    examCenterId: uuid('exam_center_id')
      .notNull()
      .references(() => examCenters.id, { onDelete: 'cascade' }),
    connectedInstituteId: uuid('connected_institute_id')
      .notNull()
      .references(() => connectedInstitutes.id, { onDelete: 'cascade' }),
    seatNumber: integer('seat_number').notNull(),
    instituteCode: text('institute_code'),
    enrollmentNumber: text('enrollment_number'),
    name: text('name'),
    scheme: text('scheme'),
    subjects: jsonb('subjects').$type<string[]>().default([]),
    subCodes: jsonb('sub_codes').$type<string[]>().default([]),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    centerSeatIdx: uniqueIndex('students_center_seat_idx').on(table.examCenterId, table.seatNumber),
    enrollmentIdx: index('students_enrollment_idx').on(table.enrollmentNumber),
    orgIdx: index('students_org_idx').on(table.orgId),
  })
);

// ============================================
// Staff (unified with documented types)
// staffType: SUPERVISOR | RELIEVER | CONTROL_ROOM
// role: LECTURER | LAB_ASSISTANT | HOD
// ============================================

export const staff = pgTable(
  'staff',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    examCenterId: uuid('exam_center_id')
      .notNull()
      .references(() => examCenters.id, { onDelete: 'cascade' }),
    uid: text('uid').notNull(),
    name: text('name').notNull(),
    department: text('department').notNull(),
    email: text('email'),
    staffType: text('staff_type').notNull(),
    role: text('role'),
    designation: text('designation'),
    postHeldInExamination: text('post_held_in_examination'),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    centerUidIdx: uniqueIndex('staff_center_uid_idx').on(table.examCenterId, table.uid),
    staffTypeIdx: index('staff_type_idx').on(table.staffType),
    orgIdx: index('staff_org_idx').on(table.orgId),
  })
);

// ============================================
// Blocks
// ============================================

export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    examCenterId: uuid('exam_center_id')
      .notNull()
      .references(() => examCenters.id, { onDelete: 'cascade' }),
    blockNo: text('block_no').notNull(),
    location: text('location').notNull(),
    name: text('name').notNull(),
    strength: integer('strength').notNull(),
    distribution: jsonb('distribution').$type<number[]>().default([10, 10, 10, 10]),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    centerLocationIdx: uniqueIndex('blocks_center_location_idx').on(
      table.examCenterId,
      table.location
    ),
    orgIdx: index('blocks_org_idx').on(table.orgId),
  })
);

// ============================================
// Block Allocations (with duplicate protection)
// ============================================

export const blockAllocations = pgTable(
  'block_allocations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    examCenterId: uuid('exam_center_id')
      .notNull()
      .references(() => examCenters.id, { onDelete: 'cascade' }),
    date: timestamp('date').notNull(),
    session: text('session').notNull(),
    timeslot: text('timeslot'),
    blockNo: text('block_no'),
    blockId: uuid('block_id').references(() => blocks.id),
    location: text('location'),
    scheme: text('scheme').notNull(),
    subjectCode: text('subject_code').notNull(),
    subjectName: text('subject_name').notNull(),
    seatNumbers: jsonb('seat_numbers').$type<number[]>().notNull(),
    firstSeat: integer('first_seat'),
    lastSeat: integer('last_seat'),
    assignedCount: integer('assigned_count'),
    strength: integer('strength'),
    supervisorUid: text('supervisor_uid'),
    supervisorName: text('supervisor_name'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueIdx: uniqueIndex('alloc_unique_idx').on(
      table.examCenterId,
      table.date,
      table.session,
      table.blockId,
      table.subjectCode
    ),
    dateSessionIdx: index('alloc_date_session_idx').on(table.date, table.session),
    blockIdx: index('alloc_block_idx').on(table.blockId),
    orgDateIdx: index('alloc_org_date_idx').on(table.orgId, table.date),
  })
);

// ============================================
// Orders
// ============================================

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    examCenterId: uuid('exam_center_id')
      .notNull()
      .references(() => examCenters.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id),
    orderType: text('order_type').notNull(),
    date: timestamp('date'),
    session: text('session'),
    orderKey: text('order_key'),
    sentAt: timestamp('sent_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    staffIdx: index('orders_staff_idx').on(table.staffId),
    dateIdx: index('orders_date_idx').on(table.date),
    orgIdx: index('orders_org_idx').on(table.orgId),
  })
);

// ============================================
// E-Marksheets
// ============================================

export const eMarksheets = pgTable(
  'e_marksheets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    examCenterId: uuid('exam_center_id')
      .notNull()
      .references(() => examCenters.id, { onDelete: 'cascade' }),
    sheetNo: text('sheet_no'),
    subjectName: text('subject_name'),
    scheme: text('scheme'),
    subjectHead: text('subject_head'),
    paperCode: text('paper_code'),
    fileName: text('file_name'),
    processedAt: timestamp('processed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('emarksheets_org_idx').on(table.orgId),
    paperCodeIdx: index('emarksheets_paper_code_idx').on(table.paperCode),
  })
);

// ============================================
// QP Inventory
// ============================================

export const qpInventory = pgTable(
  'qp_inventory',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    examCenterId: uuid('exam_center_id')
      .notNull()
      .references(() => examCenters.id, { onDelete: 'cascade' }),
    day: integer('day'),
    date: timestamp('date').notNull(),
    session: text('session').notNull(),
    subjectCode: text('subject_code').notNull(),
    expectedStudents: integer('expected_students'),
    expectedPackets: integer('expected_packets'),
    receivedPackets: integer('received_packets').default(0),
    receivedQps: integer('received_qps').default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    dateSubjectIdx: uniqueIndex('qp_date_subject_idx').on(
      table.examCenterId,
      table.date,
      table.session,
      table.subjectCode
    ),
    orgIdx: index('qp_org_idx').on(table.orgId),
  })
);

// ============================================
// Audit Logs (immutable - no updatedAt)
// ============================================

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    oldValues: jsonb('old_values'),
    newValues: jsonb('new_values'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    orgTimeIdx: index('audit_org_time_idx').on(table.orgId, table.createdAt),
    entityIdx: index('audit_entity_idx').on(table.entityType, table.entityId),
  })
);

// lib/db/schema.ts - Add/update these tables

// ============================================
// Promo Codes (Single-use, 30-day trial)
// ============================================
export const promoCodes = pgTable('promo_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  type: text('type').notNull(), // 'trial_30day'
  durationDays: integer('duration_days').notNull().default(30),
  amount: integer('amount').notNull().default(100), // ₹1 = 100 paise
  isUsed: boolean('is_used').default(false),
  usedByOrgId: uuid('used_by_org_id').references(() => organizations.id),
  usedAt: timestamp('used_at'),
  expiresAt: timestamp('expires_at'), // Optional expiry for the promo code itself
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================
// Organizations (updated)
// ============================================
export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  subscriptionTier: text('subscription_tier').default('trial').notNull(), // trial, premium, enterprise
  subscriptionExpiresAt: timestamp('subscription_expires_at'),
  trialStartedAt: timestamp('trial_started_at'), // Track when trial started
  trialEndsAt: timestamp('trial_ends_at'),
  razorpayCustomerId: text('razorpay_customer_id'),
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================
// Payments (updated)
// ============================================
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: text('plan_id').notNull(),
    planName: text('plan_name').notNull(),
    amount: integer('amount').notNull(),
    status: text('status').notNull(), // pending | paid | failed | refunded
    promoCodeId: uuid('promo_code_id').references(() => promoCodes.id),
    razorpayOrderId: text('razorpay_order_id'),
    razorpayPaymentId: text('razorpay_payment_id'),
    startDate: timestamp('start_date'),
    endDate: timestamp('end_date'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('payments_org_idx').on(table.orgId),
    orderIdx: uniqueIndex('payments_order_idx').on(table.razorpayOrderId),
  })
);
