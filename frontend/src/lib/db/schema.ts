// lib/db/schema.ts
import { relations, sql } from 'drizzle-orm';
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

// ============================================
// Organizations (BILLING & AUTH ONLY)
// ============================================

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  subscriptionTier: text('subscription_tier').default('inactive').notNull(),
  subscriptionExpiresAt: timestamp('subscription_expires_at'),
  trialStartedAt: timestamp('trial_started_at'),
  trialEndsAt: timestamp('trial_ends_at'),
  razorpayCustomerId: text('razorpay_customer_id'),
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================
// Promo Codes
// ============================================

export const promoCodes = pgTable('promo_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  type: text('type').notNull(),
  durationDays: integer('duration_days').notNull().default(30),
  amount: integer('amount').notNull().default(100),
  isUsed: boolean('is_used').default(false),
  usedByOrgId: uuid('used_by_org_id').references(() => organizations.id),
  usedAt: timestamp('used_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================
// Payments
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
  }),
);

// ============================================
// Organization Members
// ============================================

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
  }),
);

// ============================================
// Subjects Master (Global reference)
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
  }),
);

// ============================================
// Exam Centers (Operational Root)
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
    examController: text('exam_controller'),
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
    orgUniqueIdx: uniqueIndex('exam_center_org_unique').on(table.orgId),
    orgIdx: index('exam_centers_org_idx').on(table.orgId),
    // NEW: For dashboard center lookup
    orgActiveIdx: index('idx_exam_centers_org_active').on(
      table.orgId,
      table.isActive,
      table.isDeleted
    ),
  }),
);

// ============================================
// Connected Institutes
// ============================================

export const connectedInstitutes = pgTable(
  'connected_institutes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
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
      table.instituteCode,
    ),
    // NEW: For dashboard institute list
    centerActiveIdx: index('idx_connected_institutes_center').on(
      table.examCenterId,
      table.isActive
    ),
  }),
);

// ============================================
// Students
// ============================================

export const students = pgTable(
  'students',
  {
    id: uuid('id').defaultRandom().primaryKey(),
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
    // NEW: For dashboard student counts and department distribution
    centerDeptIdx: index('idx_students_center_dept').on(
      table.examCenterId,
      table.scheme,
      table.isDeleted
    ),
    centerInstituteIdx: index('idx_students_center_institute').on(
      table.examCenterId,
      table.connectedInstituteId,
      table.isDeleted
    ),
    centerEnrollmentIdx: index('idx_students_center_enrollment')
      .on(table.examCenterId, table.enrollmentNumber)
      .where(sql`${table.isDeleted} = false`),
  }),
);

// ============================================
// Staff
// ============================================

export const staff = pgTable(
  'staff',
  {
    id: uuid('id').defaultRandom().primaryKey(),
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
    // NEW: For dashboard staff statistics
    centerTypeIdx: index('idx_staff_center_type').on(
      table.examCenterId,
      table.staffType,
      table.isDeleted
    ),
  }),
);

// ============================================
// Blocks
// ============================================

export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examCenterId: uuid('exam_center_id')
      .notNull()
      .references(() => examCenters.id, { onDelete: 'cascade' }),
    blockNo: text('block_no').notNull(),
    location: text('location').notNull(),
    name: text('name').notNull(),
    strength: integer('strength').notNull(),
    distribution: jsonb('distribution').$type<number[]>().default([10, 10, 10, 10]),
    template: integer('template').default(1),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    centerLocationIdx: uniqueIndex('blocks_center_location_idx').on(
      table.examCenterId,
      table.location,
    ),
    // NEW: For dashboard blocks list
    centerActiveIdx: index('idx_blocks_center_active').on(
      table.examCenterId,
      table.isDeleted
    ),
  }),
);

// ============================================
// Timetable
// ============================================

export const timetable = pgTable(
  'timetable',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examCenterId: uuid('exam_center_id')
      .notNull()
      .references(() => examCenters.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').references(() => subjects.id),
    examDay: integer('exam_day'),
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
    cpsResolved: jsonb('cps_resolved').$type<number[]>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueIdx: uniqueIndex('tt_unique_idx').on(
      table.examCenterId,
      table.date,
      table.session,
      table.subjectCode,
      table.scheme,
    ),
    dateIdx: index('tt_date_idx').on(table.date),
    centerDateIdx: index('tt_center_date_idx').on(table.examCenterId, table.date),
    // NEW: Critical indexes for dashboard queries
    centerStatsIdx: index('idx_timetable_center_stats').on(
      table.examCenterId, 
      table.date, 
      table.session
    ),
    centerSubjectIdx: index('idx_timetable_center_subject').on(
      table.examCenterId,
      table.subjectCode,
      table.scheme
    ),
    centerCpsIdx: index('idx_timetable_center_cps')
      .on(table.examCenterId)
      .where(sql`${table.cpsStudents} IS NOT NULL AND ${table.cpsStudents} != '[]'::jsonb`),
    centerDateStatsIdx: index('idx_timetable_center_date_stats').on(
      table.examCenterId,
      sql`${table.date} DESC`
    ),
  }),
);

// ============================================
// Block Allocations
// ============================================

export const blockAllocations = pgTable(
  'block_allocations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examCenterId: uuid('exam_center_id')
      .notNull()
      .references(() => examCenters.id, { onDelete: 'cascade' }),
    connectedInstituteId: uuid('connected_institute_id').references(() => connectedInstitutes.id, {
      onDelete: 'set null',
    }),
    date: timestamp('date').notNull(),
    session: text('session').notNull(),
    timeslot: text('timeslot'),
    blockId: uuid('block_id').references(() => blocks.id),
    blockNo: text('block_no'),
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
      table.subjectCode,
    ),
    dateSessionIdx: index('alloc_date_session_idx').on(table.date, table.session),
    blockIdx: index('alloc_block_idx').on(table.blockId),
    instituteIdx: index('alloc_institute_idx').on(table.connectedInstituteId),
    // NEW: For dashboard allocation counts and daily schedule
    centerDateSessionIdx: index('idx_block_allocations_center_date_session').on(
      table.examCenterId,
      table.date,
      table.session
    ),
    centerBlockIdx: index('idx_block_allocations_center_block').on(
      table.examCenterId,
      table.blockId
    ),
    blockDateSessionIdx: index('idx_block_allocations_date_session').on(
      table.date,
      table.session
    ),
  }),
);

// ============================================
// Relations
// ============================================

export const blockAllocationsRelations = relations(blockAllocations, ({ one }) => ({
  connectedInstitute: one(connectedInstitutes, {
    fields: [blockAllocations.connectedInstituteId],
    references: [connectedInstitutes.id],
  }),
  examCenter: one(examCenters, {
    fields: [blockAllocations.examCenterId],
    references: [examCenters.id],
  }),
  block: one(blocks, {
    fields: [blockAllocations.blockId],
    references: [blocks.id],
  }),
}));

export const connectedInstitutesRelations = relations(connectedInstitutes, ({ many }) => ({
  blockAllocations: many(blockAllocations),
  students: many(students),
}));

export const studentsRelations = relations(students, ({ one }) => ({
  connectedInstitute: one(connectedInstitutes, {
    fields: [students.connectedInstituteId],
    references: [connectedInstitutes.id],
  }),
}));

// ============================================
// Orders (Staff duty orders)
// ============================================

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
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
    // NEW: For dashboard order counts
    centerIdx: index('idx_orders_center').on(table.examCenterId),
  }),
);

// ============================================
// E-Marksheets
// ============================================

export const eMarksheets = pgTable(
  'e_marksheets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
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
    paperCodeIdx: index('emarksheets_paper_code_idx').on(table.paperCode),
  }),
);

// ============================================
// QP Inventory (Question Paper Inventory)
// ============================================

export const qpInventory = pgTable(
  'qp_inventory',
  {
    id: uuid('id').defaultRandom().primaryKey(),
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
      table.subjectCode,
    ),
    // NEW: For dashboard QP inventory status
    centerIdx: index('idx_qp_inventory_center').on(table.examCenterId),
  }),
);

// ============================================
// Audit Logs (Billing & Auth only)
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
  }),
);

export const UPLOAD_STATUSES = ['UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED'] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

// ============================================
// Uploads
// ============================================

export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    examCenterId: uuid('exam_center_id')
      .notNull()
      .references(() => examCenters.id, { onDelete: 'cascade' }),
    fileType: text('file_type').notNull(),
    originalFilename: text('original_filename').notNull(),
    storedFilename: text('stored_filename').notNull(),
    fileHash: text('file_hash').notNull(),
    fileSize: integer('file_size').notNull(),
    status: text('status').$type<UploadStatus>().default('UPLOADED').notNull(),
    recordCount: integer('record_count').default(0).notNull(),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    connectedInstituteId: uuid('connected_institute_id').references(() => connectedInstitutes.id, {
      onDelete: 'set null',
    }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueUploadIdx: uniqueIndex('upload_exam_center_file_type_institute_idx').on(
      table.examCenterId,
      table.fileType,
      table.connectedInstituteId,
    ),
    uniqueNullInstituteIdx: uniqueIndex('upload_exam_center_file_type_null_institute_idx')
      .on(table.examCenterId, table.fileType)
      .where(sql`${table.connectedInstituteId} IS NULL`),
    examCenterIdx: index('upload_status_exam_center_idx').on(table.examCenterId),
    instituteUploadIdx: index('upload_institute_idx').on(table.connectedInstituteId),
  }),
);

// ============================================
// Email Logs
// ============================================

export const emailLogs = pgTable(
  'email_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    examCenterId: uuid('exam_center_id')
      .notNull()
      .references(() => examCenters.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientEmail: text('recipient_email').notNull(),
    recipientName: text('recipient_name'),
    subject: text('subject').notNull(),
    orderType: text('order_type').notNull(),
    orderKey: text('order_key'),
    status: text('status').notNull(),
    errorMessage: text('error_message'),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('email_logs_org_idx').on(table.orgId),
    examCenterIdx: index('email_logs_exam_center_idx').on(table.examCenterId),
    sentAtIdx: index('email_logs_sent_at_idx').on(table.sentAt),
    dailyUsageIdx: index('email_logs_daily_usage_idx').on(table.examCenterId, table.sentAt),
  }),
);

// ============================================
// Email Logs Relations
// ============================================

export const emailLogsRelations = relations(emailLogs, ({ one }) => ({
  organization: one(organizations, {
    fields: [emailLogs.orgId],
    references: [organizations.id],
  }),
  examCenter: one(examCenters, {
    fields: [emailLogs.examCenterId],
    references: [examCenters.id],
  }),
  user: one(users, {
    fields: [emailLogs.userId],
    references: [users.id],
  }),
}));