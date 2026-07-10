// lib/types/index.ts
import { z } from 'zod';

// ============================================
// Re-export Action Types
// ============================================

export type ActionResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string | z.ZodIssue[];
    };

// ============================================
// Staff Types
// ============================================

export type StaffType = 'SUPERVISOR' | 'RELIEVER' | 'CONTROL_ROOM';

export interface StaffMember {
  id: string;
  uid: string;
  name: string;
  department: string;
  email: string | null;
  staffType: string;
  role: string | null;
  designation: string | null;
  postHeldInExamination: string | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StaffStats {
  total: number;
  supervisors: number;
  relievers: number;
  controlRoom: number;
}

export interface StaffWithAllocations extends StaffMember {
  allocations?: StaffAllocation[];
}

export interface StaffAllocation {
  id: string;
  date: Date;
  session: string;
  blockNo: string | null;
  location: string | null;
  subjectCode: string;
  scheme: string;
}

// ============================================
// Timetable Types
// ============================================

export type SessionType = 'Morning' | 'Afternoon' | 'All';

export interface TimetableEntry {
  id: string;
  examDay: number | null;
  date: Date;
  session: SessionType;
  timeSlot: string;
  subjectCode: string;
  subjectName: string;
  scheme: string;
  subjectAbbr: string | null;
  totalStudents: number;
  absentNumbers: number[];
  cpsStudents: number[];
  createdAt: Date;
  updatedAt: Date;
}

// lib/types.ts - Update TimetableStats
export interface TimetableStats {
  totalEntries: number;
  uniqueSubjects: number;
  uniqueSchemes: number;
  examinees: number; // ← Add this
  students: number; // ← Add this
  totalAbsent: number;
  totalCps: number;
  dateRange: { min: Date; max: Date } | null;
  totalStudents?: number; // ← Make optional for backward compatibility
}

// ============================================
// Allocation Types
// ============================================

export interface AllocationData {
  id: string;
  examCenterId: string;
  date: Date;
  session: SessionType;
  timeslot: string | null;
  blockId: string | null;
  blockNo: string;
  location: string;
  scheme: string;
  subjectCode: string;
  subjectName: string;
  seatNumbers: number[];
  firstSeat: number | null;
  lastSeat: number | null;
  assignedCount: number | null;
  strength: number | null;
  supervisorUid: string | null;
  supervisorName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AllocationStats {
  totalAllocations: number;
  totalSeats: number;
  allocatedSupervisors: number;
  unassignedAllocations: number;
  dates: Date[];
}

// lib/types/index.ts - Update PackingSlipEntry

export interface PackingSlipEntry {
  instituteCode: string;
  instituteName: string; // ADD THIS
  date: string;
  session: string;
  timeSlot: string;
  scheme: string;
  subjectCode: string;
  totalStudents: number;
  sheetNo: string;
  subjectName: string;
  absentNumbers: number[];
  cpsNumbers: number[];
}
export interface SupervisionReportEntry {
  blockNo: string;
  location: string;
  supervisorName: string;
  supervisorUid: string;
  schemes: SupervisionScheme[];
}

export interface SupervisionScheme {
  scheme: string;
  subjectCode: string;
  subjectName: string;
  totalStudents: number;
  instituteCode: string;
  timeslot: string;
}

export interface QuestionPaperReportEntry {
  scheme: string;
  subjectAbbr: string;
  subjectCode: string;
  receivedQps: number;
  totalStudents: number;
  absentNumbers: number[];
  date: string;
  session: string;
}

// ============================================
// Exam Center Types
// ============================================

export interface ExamCenter {
  id: string;
  orgId: string;
  code: string;
  name: string;
  address: string | null;
  officerIncharge: string | null;
  sealingSupervisor: string | null;
  distCenterCode: string | null;
  distCenterName: string | null;
  season: 'Summer' | 'Winter' | null;
  examYear: number | null;
  startDate: Date | null;
  endDate: Date | null;
  departments: string[];
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExamCenterStats {
  staff: number;
  students: number;
  timetableEntries: number;
  allocations: number;
  orders: number;
}

// ============================================
// Organization Types
// ============================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  subscriptionTier: 'inactive' | 'trial' | 'premium' | 'enterprise';
  subscriptionExpiresAt: Date | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  razorpayCustomerId: string | null;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Institute Types
// ============================================

export interface ConnectedInstitute {
  id: string;
  examCenterId: string;
  instituteCode: string;
  instituteName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Student Types
// ============================================

export interface Student {
  id: string;
  examCenterId: string;
  connectedInstituteId: string;
  seatNumber: number;
  instituteCode: string | null;
  enrollmentNumber: string | null;
  name: string | null;
  scheme: string | null;
  subjects: string[];
  subCodes: string[];
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Block Types
// ============================================

// lib/types/index.ts
export interface Block {
  id: string;
  examCenterId: string;
  blockNo: string;
  location: string;
  name: string;
  strength: number;
  distribution: number[];
  template: number; // Add this
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface BlockAssignment {
  blockName: string;
  scheme: string;
  subCode: string;
  supervisor: string;
  numberOfCandidates: number;
  startFrom: number;
  timeslot: string;
}

// ============================================
// Subject Types
// ============================================

export interface Subject {
  id: string;
  code: string;
  name: string;
  scheme: string;
  abbr: string | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Order Types
// ============================================

export type OrderType = 'supervision' | 'reliever' | 'control_room' | 'oic';

export interface Order {
  id: string;
  examCenterId: string;
  staffId: string;
  orderType: OrderType;
  date: Date | null;
  session: string | null;
  orderKey: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  staff?: StaffMember;
}

// ============================================
// Payment Types
// ============================================

export interface Payment {
  id: string;
  orgId: string;
  planId: string;
  planName: string;
  amount: number;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  promoCodeId: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
}

export interface PromoCode {
  id: string;
  code: string;
  type: 'trial';
  durationDays: number;
  amount: number;
  isUsed: boolean;
  usedByOrgId: string | null;
  usedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

// ============================================
// E-Marksheet Types
// ============================================

export interface EMarksheet {
  id: string;
  examCenterId: string;
  sheetNo: string | null;
  subjectName: string | null;
  scheme: string | null;
  subjectHead: string | null;
  paperCode: string | null;
  fileName: string | null;
  processedAt: Date | null;
  createdAt: Date;
}

// ============================================
// QP Inventory Types
// ============================================

export interface QPInventory {
  id: string;
  examCenterId: string;
  day: number | null;
  date: Date;
  session: string;
  subjectCode: string;
  expectedStudents: number | null;
  expectedPackets: number | null;
  receivedPackets: number;
  receivedQps: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Audit Log Types
// ============================================

export interface AuditLog {
  id: string;
  orgId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

// ============================================
// Session Types
// ============================================

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface ExamCenterData {
  id: string;
  orgId: string;
  code: string;
  name: string;
  address: string | null;
  officerIncharge: string | null;
  sealingSupervisor: string | null;
  distCenterCode: string | null;
  distCenterName: string | null;
  season: 'Summer' | 'Winter' | null;
  examYear: number | null;
  startDate: Date | null;
  endDate: Date | null;
  departments: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationData {
  id: string;
  name: string;
  slug: string;
  subscriptionTier: string;
  subscriptionExpiresAt: Date | null;
}

export interface CurrentOrgResponse {
  user: SessionUser;
  org: OrganizationData;
  orgId: string;
  role: string;
}

// ============================================
// User Types
// ============================================

export interface UserInfo {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  } | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    subscriptionTier: string;
    subscriptionExpiresAt: string | null;
  } | null;
  examCenter: {
    id: string;
    code: string;
    name: string;
    address: string | null;
    officerIncharge: string | null;
    sealingSupervisor: string | null;
    distCenterCode: string | null;
    distCenterName: string | null;
    season: string | null;
    examYear: number | null;
  } | null;
  subscription: {
    tier: string;
    planName: string;
    expiresAt: string | null;
    isActive: boolean;
  } | null;
}

// ============================================
// Validation Schema Types (Inferred)
// ============================================

// Timetable Schemas
export type TimetableEntryInput = z.infer<
  typeof import('../actions/timetable') extends { TimetableEntrySchema: infer S } ? S : never
>;
export type BulkImportInput = z.infer<
  typeof import('../actions/timetable') extends { BulkImportSchema: infer S } ? S : never
>;
export type UpdateEntryInput = z.infer<
  typeof import('../actions/timetable') extends { UpdateEntrySchema: infer S } ? S : never
>;
export type MarkAbsentInput = z.infer<
  typeof import('../actions/timetable') extends { MarkAbsentSchema: infer S } ? S : never
>;
export type MarkCopyCaseInput = z.infer<
  typeof import('../actions/timetable') extends { MarkCopyCaseSchema: infer S } ? S : never
>;

// Staff Schemas
export type CreateStaffInput = z.infer<
  typeof import('../actions/staff') extends { CreateStaffSchema: infer S } ? S : never
>;
export type UpdateStaffInput = z.infer<
  typeof import('../actions/staff') extends { UpdateStaffSchema: infer S } ? S : never
>;
export type BulkCreateStaffInput = z.infer<
  typeof import('../actions/staff') extends { BulkCreateStaffSchema: infer S } ? S : never
>;
export type AssignSupervisorsInput = z.infer<
  typeof import('../actions/staff') extends { AssignSupervisorsSchema: infer S } ? S : never
>;
export type ReplaceStaffInput = z.infer<
  typeof import('../actions/staff') extends { ReplaceStaffSchema: infer S } ? S : never
>;

// Allocation Schemas
export type CreateAllocationInput = z.infer<
  typeof import('../actions/allocation') extends { CreateAllocationSchema: infer S } ? S : never
>;
export type UpdateAllocationInput = z.infer<
  typeof import('../actions/allocation') extends { UpdateAllocationSchema: infer S } ? S : never
>;
export type AssignSupervisorInput = z.infer<
  typeof import('../actions/allocation') extends { AssignSupervisorSchema: infer S } ? S : never
>;
export type BulkAssignSupervisorsInput = z.infer<
  typeof import('../actions/allocation') extends { BulkAssignSupervisorsSchema: infer S }
    ? S
    : never
>;
export type AutoAllocateInput = z.infer<
  typeof import('../actions/allocation') extends { AutoAllocateSchema: infer S } ? S : never
>;
export type ClearAllocationsInput = z.infer<
  typeof import('../actions/allocation') extends { ClearAllocationsSchema: infer S } ? S : never
>;

// ============================================
// Helper Types
// ============================================

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type DateRange = {
  from: Date;
  to: Date;
};

export type SortDirection = 'asc' | 'desc';

export type SortOptions<T> = {
  field: keyof T;
  direction: SortDirection;
};

export type FilterOptions<T> = {
  [K in keyof T]?: T[K] | T[K][];
};

export type QueryOptions<T> = {
  filters?: FilterOptions<T>;
  sort?: SortOptions<T>;
  pagination?: {
    page: number;
    pageSize: number;
  };
};

export interface ExistingAllocation {
  blockName: string | null;
  scheme: string;
  subjectCode: string;
  assignedCount: number | null;
}

export interface BulkCreateResponse {
  success: boolean;
  error?: string;
  existingCount?: number;
  existingAllocations?: ExistingAllocation[];
  data?: any;
}

export interface ExistingCheckResponse {
  success: boolean;
  error?: string;
  existingCount?: number;
  data?: {
    hasAllocations: boolean;
    allocations: ExistingAllocation[];
  };
}
export interface SessionInfo {
  date: string;
  session: 'Morning' | 'Afternoon' | 'All' | 'All';
}

export interface SessionData {
  date: Date;
  session: string;
  availableBlocks?: number;
  totalStudents?: number;
  isLocked?: boolean;
  metadata?: Record<string, any>;
}

export interface SessionSelectorProps {
  // Core props
  onSessionSelect: (session: SessionInfo) => void | Promise<void>;
  onCancel?: () => void;
  showAllSession?: boolean;
  // Data props
  availableDates?: Date[];
  availableSessions?: string[];
  isLoading?: boolean;
  error?: string | null;

  // Selection state
  defaultDate?: string;
  defaultSession?: string;

  // UI customization
  title?: string;
  description?: string;
  className?: string;
  compact?: boolean;

  // Validation
  validateSession?: (
    date: string,
    session: string,
  ) => Promise<{ valid: boolean; message?: string; data?: SessionData }>;

  // Callbacks
  onDateChange?: (date: string) => void;
  onSessionChange?: (session: string) => void;

  // Additional data display
  showMetadata?: boolean;
  metadataRenderer?: (data: SessionData) => React.ReactNode;

  // Actions
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
    icon?: React.ReactNode;
    disabled?: boolean;
  }>;
}

// lib/types/email.ts
export interface EmailLogEntry {
  id: string;
  orgId: string;
  examCenterId: string;
  userId: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  orderType: 'supervision' | 'reliever' | 'chief';
  orderKey: string | null;
  status: 'sent' | 'failed';
  errorMessage: string | null;
  sentAt: Date;
  createdAt: Date;
}

export interface DailyUsageStats {
  examCenterId: string;
  examCenterCode: string;
  examCenterName: string;
  sent: number;
  failed: number;
  total: number;
  limit: number;
  remaining: number;
  percentage: number;
  isOverLimit: boolean;
}

export interface GlobalUsageStats {
  totalSent: number;
  totalFailed: number;
  total: number;
  limit: number;
  remaining: number;
  percentage: number;
  isOverLimit: boolean;
  centers: DailyUsageStats[];
}

export interface MonthlyUsageStats {
  total: number;
  limit: number;
  remaining: number;
  percentage: number;
}
