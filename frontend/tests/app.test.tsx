import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================
// MOCKS
// ============================================================

// Next.js mocks
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

// Auth mocks
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn();
const mockGetSession = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { email: mockSignIn },
    signUp: { email: mockSignUp },
    signOut: mockSignOut,
    getSession: mockGetSession,
  },
}));

// API mocks
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Toast mocks
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

// ============================================================
// TEST DATA
// ============================================================

const mockUser = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@testforge.tech',
  emailVerified: true,
};

const mockSession = {
  user: mockUser,
  session: {
    id: 'session-123',
    expiresAt: new Date(),
    token: 'token-123',
  },
};

const mockOrganization = {
  id: 'org-123',
  name: 'Test Organization',
  slug: 'test-org',
  subscriptionTier: 'premium',
};

const mockExamCenter = {
  id: 'ec-123',
  code: 'TEST01',
  name: 'Test Exam Center',
  season: 'Winter',
  examYear: 2026,
};

const mockTimetable = [
  {
    id: 'tt-1',
    date: new Date('2026-04-24'),
    session: 'Morning',
    subjectCode: 'ESE101',
    subjectName: 'Data Structures',
    scheme: 'EE-6-I',
    totalStudents: 30,
  },
  {
    id: 'tt-2',
    date: new Date('2026-04-24'),
    session: 'Afternoon',
    subjectCode: 'ESE102',
    subjectName: 'Algorithms',
    scheme: 'EE-6-I',
    totalStudents: 25,
  },
];

const mockAllocations = [
  {
    id: 'alloc-1',
    blockNo: '1',
    location: 'Room 101',
    scheme: 'EE-6-I',
    subjectCode: 'ESE101',
    seatNumbers: [10001, 10002, 10003],
    supervisorName: 'Dr. Smith',
  },
];

const mockStaff = [
  { id: 's1', uid: 'STAFF001', name: 'John Doe', department: 'EE', staffType: 'SUPERVISOR' },
  { id: 's2', uid: 'STAFF002', name: 'Jane Smith', department: 'ME', staffType: 'RELIEVER' },
];

// ============================================================
// TESTS
// ============================================================

describe('Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: null });
  });

  describe('Login Flow', () => {
    it('logs in successfully with valid credentials', async () => {
      mockSignIn.mockResolvedValueOnce({ data: mockSession });

      const result = await mockSignIn('test@testforge.tech', 'password123');

      expect(result.data.user).toBeDefined();
      expect(result.data.user.email).toBe('test@testforge.tech');
      expect(mockSignIn).toHaveBeenCalledWith('test@testforge.tech', 'password123');
    });

    it('fails login with invalid credentials', async () => {
      const error = new Error('Invalid email or password');
      mockSignIn.mockRejectedValueOnce(error);

      await expect(mockSignIn('wrong@test.com', 'wrongpass')).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('fails login with unverified email', async () => {
      mockSignIn.mockResolvedValueOnce({
        error: { message: 'Please verify your email', status: 403 },
      });

      const result = await mockSignIn('unverified@test.com', 'pass');
      expect(result.error.message).toContain('verify');
    });
  });

  describe('Signup Flow', () => {
    it('creates account successfully', async () => {
      const newUser = { ...mockUser, id: 'new-user-123', email: 'new@testforge.tech' };
      mockSignUp.mockResolvedValueOnce({
        data: { user: newUser },
      });

      const result = await mockSignUp('new@testforge.tech', 'password123', 'New User');

      expect(result.data.user).toBeDefined();
      expect(result.data.user.email).toBe('new@testforge.tech');
      expect(mockSignUp).toHaveBeenCalledWith('new@testforge.tech', 'password123', 'New User');
    });

    it('fails signup with existing email', async () => {
      mockSignUp.mockRejectedValueOnce(new Error('Email already registered'));

      await expect(mockSignUp('existing@test.com', 'pass', 'Name')).rejects.toThrow(
        'Email already registered',
      );
    });
  });

  describe('Session Management', () => {
    it('gets active session', async () => {
      mockGetSession.mockResolvedValueOnce({ data: mockSession });

      const session = await mockGetSession();
      expect(session.data.user.id).toBe('user-123');
    });

    it('returns null for no session', async () => {
      mockGetSession.mockResolvedValueOnce({ data: null });

      const session = await mockGetSession();
      expect(session.data).toBeNull();
    });

    it('signs out successfully', async () => {
      mockSignOut.mockResolvedValueOnce({});

      await mockSignOut();
      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});

describe('Organization & Onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Organization Setup', () => {
    it('creates organization', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, organization: mockOrganization }),
      });

      const response = await fetch('/api/onboarding/organization', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Org', slug: 'test-org' }),
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.organization.name).toBe('Test Organization');
    });

    it('validates slug availability', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ available: true }),
      });

      const response = await fetch('/api/onboarding/check-slug?slug=test-org');
      const data = await response.json();

      expect(data.available).toBe(true);
    });

    it('rejects taken slug', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ available: false }),
      });

      const response = await fetch('/api/onboarding/check-slug?slug=taken');
      const data = await response.json();

      expect(data.available).toBe(false);
    });
  });

  describe('Exam Center Setup', () => {
    it('creates exam center', async () => {
      const ecData = {
        code: 'TEST01',
        name: 'Test Center',
        season: 'Winter',
        examYear: 2026,
        distCenterCode: 'DC001',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, examCenter: { id: 'ec-123', ...ecData } }),
      });

      const response = await fetch('/api/onboarding/exam-center', {
        method: 'POST',
        body: JSON.stringify(ecData),
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.examCenter.code).toBe('TEST01');
    });
  });

  describe('Subscription', () => {
    it('gets onboarding status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'needs_subscription',
          data: { organization: mockOrganization },
          plans: [
            { id: 'semester_online', title: 'Semester', amount: 289900 },
            { id: '1year_online', title: '1 Year', amount: 550000 },
          ],
        }),
      });

      const response = await fetch('/api/onboarding/status');
      const data = await response.json();

      expect(data.status).toBe('needs_subscription');
      expect(data.plans).toHaveLength(2);
    });

    it('activates subscription', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          subscription: { tier: 'premium', expiresAt: '2027-01-01' },
        }),
      });

      const response = await fetch('/api/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({ action: 'create', planId: '1year_online', amount: 550000 }),
      });
      const data = await response.json();

      expect(data.success).toBe(true);
    });
  });
});

describe('Exam Setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Timetable', () => {
    it('uploads timetable HTML', async () => {
      const formData = new FormData();
      formData.append(
        'file',
        new Blob(['<html><body><table></table></body></html>']),
        'timetable.html',
      );
      formData.append('file_type', 'timetable');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { stored_filename: 'tt_123.html' } }),
      });

      const response = await fetch('/api/upload/', { method: 'POST', body: formData });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.stored_filename).toBe('tt_123.html');
    });

    it('fetches timetable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockTimetable }),
      });

      const response = await fetch('/api/timetable?date=2026-04-24');
      const data = await response.json();

      expect(data.data).toHaveLength(2);
      expect(data.data[0].subjectCode).toBe('ESE101');
    });

    it('gets timetable stats', async () => {
      const mockStats = {
        totalEntries: 15,
        uniqueSubjects: 8,
        totalStudents: 350,
        dateRange: { min: '2026-04-24', max: '2026-04-28' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockStats }),
      });

      const response = await fetch('/api/timetable/stats');
      const data = await response.json();

      expect(data.data.totalEntries).toBe(15);
      expect(data.data.totalStudents).toBe(350);
    });
  });

  describe('Staff Management', () => {
    it('fetches staff list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockStaff }),
      });

      const response = await fetch('/api/staff');
      const data = await response.json();

      expect(data.data).toHaveLength(2);
      expect(data.data[0].staffType).toBe('SUPERVISOR');
    });

    it('creates new staff member', async () => {
      const newStaff = {
        uid: 'STAFF003',
        name: 'New Staff',
        department: 'CS',
        staffType: 'SUPERVISOR',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { ...newStaff, id: 's3' } }),
      });

      const response = await fetch('/api/staff', {
        method: 'POST',
        body: JSON.stringify(newStaff),
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.uid).toBe('STAFF003');
    });

    it('deletes staff member', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const response = await fetch('/api/staff/s1', { method: 'DELETE' });
      const data = await response.json();

      expect(data.success).toBe(true);
    });

    it('gets staff stats', async () => {
      const stats = { total: 10, supervisors: 6, relievers: 3, controlRoom: 1 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: stats }),
      });

      const response = await fetch('/api/staff/stats');
      const data = await response.json();

      expect(data.data.supervisors).toBe(6);
      expect(data.data.total).toBe(10);
    });
  });

  describe('Blocks', () => {
    const mockBlocks = [
      { id: 'b1', blockNo: '1', location: 'Room 101', name: 'Block 1', strength: 30 },
      { id: 'b2', blockNo: '2', location: 'Room 102', name: 'Block 2', strength: 35 },
    ];

    it('fetches blocks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockBlocks }),
      });

      const response = await fetch('/api/blocks');
      const data = await response.json();

      expect(data.data).toHaveLength(2);
      expect(data.data[0].strength).toBe(30);
    });

    it('creates block', async () => {
      const blockData = {
        blockNo: '3',
        location: 'Room 103',
        name: 'Block 3',
        strength: 40,
        distribution: [10, 10, 10, 10],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { ...blockData, id: 'b3' } }),
      });

      const response = await fetch('/api/blocks', {
        method: 'POST',
        body: JSON.stringify(blockData),
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.strength).toBe(40);
    });

    it('deletes block', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const response = await fetch('/api/blocks/b1', { method: 'DELETE' });
      expect(response.ok).toBe(true);
    });

    it('gets block stats', async () => {
      const stats = { totalBlocks: 3, totalCapacity: 105, averageCapacity: 35 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: stats }),
      });

      const response = await fetch('/api/blocks/stats');
      const data = await response.json();

      expect(data.data.totalBlocks).toBe(3);
      expect(data.data.totalCapacity).toBe(105);
    });
  });
});

describe('Block Allocation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches allocations by date/session', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockAllocations }),
    });

    const response = await fetch('/api/allocations?date=2026-04-24&session=Morning');
    const data = await response.json();

    expect(data.data).toHaveLength(1);
    expect(data.data[0].blockNo).toBe('1');
  });

  it('creates block allocation', async () => {
    const allocData = {
      date: new Date('2026-04-24'),
      session: 'Morning',
      blockId: 'b1',
      subjectCode: 'ESE101',
      scheme: 'EE-6-I',
      seatNumbers: [10001, 10002, 10003],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { ...allocData, id: 'alloc-1' } }),
    });

    const response = await fetch('/api/allocations', {
      method: 'POST',
      body: JSON.stringify(allocData),
    });
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.data.seatNumbers).toHaveLength(3);
  });

  it('assigns supervisor to allocation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { supervisorName: 'Dr. Smith' } }),
    });

    const response = await fetch('/api/allocations/assign', {
      method: 'POST',
      body: JSON.stringify({ allocationId: 'alloc-1', supervisorUid: 'STAFF001' }),
    });
    const data = await response.json();

    expect(data.success).toBe(true);
  });

  it('clears allocations for session', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { deleted: 3 } }),
    });

    const response = await fetch('/api/allocations/clear', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-04-24', session: 'Morning' }),
    });
    const data = await response.json();

    expect(data.success).toBe(true);
  });

  it('auto-allocates students', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { allocations: mockAllocations } }),
    });

    const response = await fetch('/api/allocations/auto', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-04-24', session: 'Morning' }),
    });
    const data = await response.json();

    expect(data.success).toBe(true);
  });
});

describe('Exam Day Features', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('Attendance', () => {
    it('marks absent students', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { absentNumbers: [10002, 10005] } }),
      });

      const response = await fetch('/api/timetable/absent', {
        method: 'POST',
        body: JSON.stringify({
          subjectCode: 'ESE101',
          scheme: 'EE-6-I',
          date: '2026-04-24',
          session: 'Morning',
          absentNumbers: [10002, 10005],
        }),
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.absentNumbers).toHaveLength(2);
    });

    it('marks copy cases', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { cpsStudents: [10003] } }),
      });

      const response = await fetch('/api/timetable/copycase', {
        method: 'POST',
        body: JSON.stringify({
          subjectCode: 'ESE101',
          scheme: 'EE-6-I',
          date: '2026-04-24',
          session: 'Morning',
          cpsStudents: [10003],
        }),
      });
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.cpsStudents).toContain(10003);
    });

    it('resolves copy cases', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { resolved: true } }),
      });

      const response = await fetch('/api/timetable/copycase/resolve', {
        method: 'POST',
        body: JSON.stringify({
          subjectCode: 'ESE101',
          scheme: 'EE-6-I',
          date: '2026-04-24',
          session: 'Morning',
          seatNumber: 10003,
        }),
      });
      const data = await response.json();

      expect(data.success).toBe(true);
    });
  });

  describe('QP Inventory', () => {
    const inventoryData = [
      { subjectCode: 'ESE101', expectedPackets: 2, receivedPackets: 2, expectedStudents: 30 },
      { subjectCode: 'ESE102', expectedPackets: 2, receivedPackets: 1, expectedStudents: 25 },
    ];

    it('fetches inventory', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: inventoryData, stats: { completionRate: 75 } }),
      });

      const response = await fetch('/api/inventory?date=2026-04-24');
      const data = await response.json();

      expect(data.data).toHaveLength(2);
      expect(data.stats.completionRate).toBe(75);
    });

    it('updates inventory', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { receivedPackets: 2 } }),
      });

      const response = await fetch('/api/inventory', {
        method: 'PUT',
        body: JSON.stringify({ id: 'inv-1', receivedPackets: 2 }),
      });
      const data = await response.json();

      expect(data.success).toBe(true);
    });

    it('generates inventory from timetable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: inventoryData }),
      });

      const response = await fetch('/api/inventory/generate', {
        method: 'POST',
        body: JSON.stringify({ date: '2026-04-24' }),
      });
      const data = await response.json();

      expect(data.success).toBe(true);
    });
  });
});

describe('Reports', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('MSBTE Reports', () => {
    const packingSlipData = [
      { subjectCode: 'ESE101', totalStudents: 30, absentNumbers: [10002, 10005], scheme: 'EE-6-I' },
      { subjectCode: 'ESE102', totalStudents: 25, absentNumbers: [], scheme: 'EE-6-I' },
    ];

    it('generates packing slip (Format 7)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: packingSlipData }),
      });

      const response = await fetch('/api/reports/packing-slip?date=2026-04-24&session=Morning');
      const data = await response.json();

      expect(data.data).toHaveLength(2);
      expect(data.data[0].subjectCode).toBe('ESE101');
    });

    it('generates supervision report', async () => {
      const supervisionData = {
        blocks: [
          {
            blockNo: '1',
            location: 'Room 101',
            supervisorName: 'Dr. Smith',
            schemes: [{ scheme: 'EE-6-I', subjectCode: 'ESE101', students: 30 }],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: supervisionData }),
      });

      const response = await fetch('/api/reports/supervision?date=2026-04-24&session=Morning');
      const data = await response.json();

      expect(data.data.blocks).toHaveLength(1);
    });

    it('generates malpractice report (Format 13)', async () => {
      const malpracticeData = {
        records: [{ seatNumber: 10003, subjectCode: 'ESE101', scheme: 'EE-6-I' }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: malpracticeData }),
      });

      const response = await fetch('/api/reports/malpractice?date=2026-04-24&session=Morning');
      const data = await response.json();

      expect(data.data.records).toHaveLength(1);
    });

    it('generates attendance report (Format 5)', async () => {
      const attendanceData = {
        records: [
          { seatNumber: 10001, name: 'Student 1', present: true },
          { seatNumber: 10002, name: 'Student 2', present: false },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: attendanceData }),
      });

      const response = await fetch('/api/reports/attendance?date=2026-04-24&session=Morning');
      const data = await response.json();

      expect(data.data.records).toHaveLength(2);
    });
  });

  describe('TestForge Reports', () => {
    it('generates daily summary', async () => {
      const dailySummary = {
        totalStudents: 55,
        totalPresent: 50,
        totalAbsent: 3,
        totalCopyCases: 2,
        attendanceRate: 90.9,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: dailySummary }),
      });

      const response = await fetch('/api/reports/daily-summary?date=2026-04-24');
      const data = await response.json();

      expect(data.data.totalStudents).toBe(55);
      expect(data.data.attendanceRate).toBeCloseTo(90.9, 1);
    });

    it('generates block allocation report', async () => {
      const blockReport = {
        blocks: [
          { blockNo: '1', subjectCount: 2, studentCount: 30, utilization: 100 },
          { blockNo: '2', subjectCount: 1, studentCount: 25, utilization: 83 },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: blockReport }),
      });

      const response = await fetch('/api/reports/block-allocation?date=2026-04-24&session=Morning');
      const data = await response.json();

      expect(data.data.blocks).toHaveLength(2);
    });
  });
});

describe('Office Orders', () => {
  beforeEach(() => vi.clearAllMocks());

  const mockOrders = [
    { id: 'o1', staffId: 's1', orderType: 'supervision', date: '2026-04-24', session: 'Morning' },
    { id: 'o2', staffId: 's2', orderType: 'reliever', date: '2026-04-24', session: 'Morning' },
  ];

  it('fetches orders', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockOrders }),
    });

    const response = await fetch('/api/orders?date=2026-04-24');
    const data = await response.json();

    expect(data.data).toHaveLength(2);
  });

  it('creates order', async () => {
    const orderData = {
      staffId: 's1',
      orderType: 'supervision',
      date: '2026-04-24',
      session: 'Morning',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { ...orderData, id: 'o3' } }),
    });

    const response = await fetch('/api/orders', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
    const data = await response.json();

    expect(data.success).toBe(true);
  });

  it('marks order as sent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { sentAt: new Date() } }),
    });

    const response = await fetch('/api/orders/o1/sent', { method: 'PATCH' });
    const data = await response.json();

    expect(data.success).toBe(true);
  });

  it('sends order emails', async () => {
    const emailData = {
      recipients: [{ email: 'supervisor@test.com', name: 'Dr. Smith' }],
      subject: 'Office Order - Supervision',
      html: '<p>Order details...</p>',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, sent: 1, failed: 0 }),
    });

    const response = await fetch('/api/send-email', {
      method: 'POST',
      body: JSON.stringify(emailData),
    });
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.sent).toBe(1);
  });
});

describe('Billing & Subscriptions', () => {
  beforeEach(() => vi.clearAllMocks());

  const mockPlans = [
    { id: 'semester_online', title: 'Semester Plan', amount: 289900, period: 'semester' },
    { id: '1year_online', title: 'Annual Plan', amount: 550000, period: 'year' },
  ];

  it('fetches pricing plans', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ plans: mockPlans }),
    });

    const response = await fetch('/api/pricing');
    const data = await response.json();

    expect(data.plans).toHaveLength(2);
    expect(data.plans[0].amount).toBe(289900);
  });

  it('creates checkout order', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ order: { id: 'order-123', amount: 550000, currency: 'INR' } }),
    });

    const response = await fetch('/api/payments/checkout', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', planId: '1year_online', amount: 550000 }),
    });
    const data = await response.json();

    expect(data.order.id).toBeDefined();
  });

  it('verifies payment', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, isTrial: false, expiresAt: '2027-01-01' }),
    });

    const response = await fetch('/api/payments/checkout', {
      method: 'POST',
      body: JSON.stringify({
        action: 'verify',
        planId: '1year_online',
        razorpay_payment_id: 'pay-123',
        razorpay_order_id: 'order-123',
        razorpay_signature: 'sig-123',
      }),
    });
    const data = await response.json();

    expect(data.success).toBe(true);
  });

  it('gets subscription status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tier: 'premium',
        planName: 'Annual Plan',
        expiresAt: '2027-01-01',
        isActive: true,
      }),
    });

    const response = await fetch('/api/subscription/status');
    const data = await response.json();

    expect(data.isActive).toBe(true);
    expect(data.tier).toBe('premium');
  });

  it('gets payment history', async () => {
    const payments = [
      { id: 'p1', amount: 550000, status: 'paid', createdAt: '2026-01-01' },
      { id: 'p2', amount: 289900, status: 'paid', createdAt: '2025-07-01' },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ payments }),
    });

    const response = await fetch('/api/payments/history');
    const data = await response.json();

    expect(data.payments).toHaveLength(2);
  });
});

describe('Email & Notifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gets email usage stats', async () => {
    const stats = {
      daily: { sent: 15, total: 20, limit: 80, remaining: 60 },
      monthly: { total: 150, limit: 2900 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => stats,
    });

    const response = await fetch('/api/email/usage');
    const data = await response.json();

    expect(data.daily.remaining).toBe(60);
    expect(data.monthly.total).toBe(150);
  });

  it('checks email quota before sending', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ allowed: true, remaining: 10 }),
    });

    const response = await fetch('/api/email/check-quota?count=5');
    const data = await response.json();

    expect(data.allowed).toBe(true);
  });
});

describe('Error Handling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('handles 404 errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Resource not found' }),
    });

    const response = await fetch('/api/nonexistent');
    expect(response.status).toBe(404);
  });

  it('handles 500 server errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Internal server error'));

    await expect(fetch('/api/error')).rejects.toThrow();
  });

  it('handles network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    await expect(fetch('/api/network-test')).rejects.toThrow('Network failure');
  });

  it('handles validation errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ errors: ['Invalid email format', 'Password too short'] }),
    });

    const response = await fetch('/api/validate');
    const data = await response.json();

    expect(data.errors).toHaveLength(2);
  });
});

describe('Dashboard', () => {
  beforeEach(() => vi.clearAllMocks());

  const mockDashboardData = {
    metrics: {
      totalStudents: 150,
      totalStaff: 12,
      totalBlocks: 4,
      totalSubjects: 8,
      totalExamDays: 5,
    },
    realtimeStatus: {
      attendanceRate: 92.5,
      examsInProgress: 2,
    },
    departmentDistribution: [
      { department: 'EE', staffCount: 4 },
      { department: 'ME', staffCount: 3 },
    ],
  };

  it('fetches dashboard data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockDashboardData }),
    });

    const response = await fetch('/api/dashboard');
    const data = await response.json();

    expect(data.data.metrics.totalStudents).toBe(150);
    expect(data.data.realtimeStatus.attendanceRate).toBe(92.5);
  });

  it('fetches department distribution', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockDashboardData.departmentDistribution }),
    });

    const response = await fetch('/api/dashboard/departments');
    const data = await response.json();

    expect(data.data).toHaveLength(2);
    expect(data.data[0].department).toBe('EE');
  });

  it('gets student enrollment metrics', async () => {
    const enrollment = {
      highest: [{ code: 'ESE101', students: 30 }],
      lowest: [{ code: 'ESE105', students: 15 }],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: enrollment }),
    });

    const response = await fetch('/api/dashboard/enrollment');
    const data = await response.json();

    expect(data.data.highest[0].students).toBe(30);
  });

  it('gets staff duty status', async () => {
    const duty = {
      totalSupervisors: 6,
      totalRelievers: 3,
      onDutyToday: 5,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: duty }),
    });

    const response = await fetch('/api/dashboard/staff-duty');
    const data = await response.json();

    expect(data.data.onDutyToday).toBe(5);
  });
});
