// modules/block-allocation/supervision-order.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import departments from '@/config/course_codes.json';
import { format } from 'date-fns';
import {
  BarChart,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Save,
  UserCheck,
  Users,
  Users2,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';

import { getAllocationsByDateSession } from '@/lib/actions2/allocation';
import { getBlocks } from '@/lib/actions2/block';
import { createOrder, deleteOrder, getOrders } from '@/lib/actions2/order';
import { getStaff } from '@/lib/actions2/staff';
import { getTimetableEntries } from '@/lib/actions2/timetable';
import { cn } from '@/lib/utils';

import { useUserInfo } from '@/hooks/useUserInfo';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

const getDept = (code: string) => (departments as Record<string, string>)[code] || code;

// ============================================================
// Types
// ============================================================

interface StaffMember {
  id: string;
  uid: string;
  name: string;
  department: string;
  role: string | null;
  email: string | null;
  staffType: string;
}

interface SessionData {
  date: string;
  session: 'Morning' | 'Afternoon';
  totalStudents: number;
  requiredSupervisors: number;
  requiredRelievers: number;
  departments: string[];
  schemes: string[];
  supervisorAllotted: string[];
  relieverAllotted: string[];
}

interface GroupedStaff {
  department: string;
  members: StaffMember[];
}

// ============================================================
// Constants
// ============================================================

const MIN_SUPERVISORS = 2;
const RELIEVER_RATIO = 3;
const STAFF_PER_BLOCK_KEY = 'staffPerBlock';

// ============================================================
// Main Component
// ============================================================

export default function SupervisionOrder() {
  const { examCenter, isLoading: userLoading } = useUserInfo();

  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [session, setSession] = useState<'Morning' | 'Afternoon'>('Morning');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supervisors, setSupervisors] = useState<StaffMember[]>([]);
  const [relievers, setRelievers] = useState<StaffMember[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [selectedSupervisors, setSelectedSupervisors] = useState<Record<string, string[]>>({});
  const [selectedRelievers, setSelectedRelievers] = useState<Record<string, string[]>>({});
  const [existingSupervisorOrders, setExistingSupervisorOrders] = useState<
    Record<string, string[]>
  >({});
  const [existingRelieverOrders, setExistingRelieverOrders] = useState<Record<string, string[]>>(
    {},
  );
  const [isAllSaved, setIsAllSaved] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [staffPerBlock, setStaffPerBlock] = useState<number>(30);
  const [isLoadingStaffPerBlock, setIsLoadingStaffPerBlock] = useState(true);

  // ============================================================
  // Get Staff Per Block (Avg Strength)
  // ============================================================

  const getStaffPerBlock = useCallback(async () => {
    setIsLoadingStaffPerBlock(true);
    try {
      // Check localStorage first
      const storedValue = localStorage.getItem(STAFF_PER_BLOCK_KEY);
      if (storedValue) {
        const parsed = parseInt(storedValue, 10);
        if (!isNaN(parsed) && parsed > 0) {
          setStaffPerBlock(parsed);
          setIsLoadingStaffPerBlock(false);
          return;
        }
      }

      // If not in localStorage, fetch from blocks
      const blocksResult = await getBlocks();
      if (blocksResult.success && blocksResult.data && blocksResult.data.length > 0) {
        const totalStrength = blocksResult.data.reduce((sum, block) => sum + block.strength, 0);
        const avgStrength = Math.round(totalStrength / blocksResult.data.length);
        setStaffPerBlock(avgStrength);
        // Save to localStorage
        localStorage.setItem(STAFF_PER_BLOCK_KEY, String(avgStrength));
      } else {
        // Default fallback
        const defaultStrength = 30;
        setStaffPerBlock(defaultStrength);
        localStorage.setItem(STAFF_PER_BLOCK_KEY, String(defaultStrength));
      }
    } catch (error) {
      console.error('Error fetching staff per block:', error);
      // Fallback to default
      const defaultStrength = 30;
      setStaffPerBlock(defaultStrength);
      localStorage.setItem(STAFF_PER_BLOCK_KEY, String(defaultStrength));
    } finally {
      setIsLoadingStaffPerBlock(false);
    }
  }, []);

  // ============================================================
  // Fetch Staff
  // ============================================================

  useEffect(() => {
    const fetchStaff = async () => {
      const [supResult, relResult] = await Promise.all([
        getStaff('SUPERVISOR'),
        getStaff('RELIEVER'),
      ]);
      if (supResult.success && supResult.data) {
        setSupervisors(supResult.data);
      }
      if (relResult.success && relResult.data) {
        setRelievers(relResult.data);
      }
    };
    fetchStaff();
    getStaffPerBlock();
  }, [getStaffPerBlock]);

  // ============================================================
  // Load Data
  // ============================================================

  const loadData = useCallback(async () => {
    if (!date || !session) {
      toast.warning('Please select both date and session');
      return;
    }

    setLoading(true);
    try {
      const dateObj = new Date(date);

      // Fetch all data in parallel
      const [supOrders, relOrders, allocations, timetable] = await Promise.all([
        getOrders({ orderType: 'supervision', date: dateObj }),
        getOrders({ orderType: 'reliever', date: dateObj }),
        getAllocationsByDateSession(dateObj, session),
        getTimetableEntries({ date: dateObj, session }),
      ]);

      const supOrdersList = supOrders || [];
      const relOrdersList = relOrders || [];
      const allocData = allocations.success && allocations.data ? allocations.data : [];
      const ttData = timetable.success && timetable.data ? timetable.data : [];

      // Calculate totals
      let totalStudents = 0;
      const schemes: string[] = [];
      const departments: string[] = [];

      if (ttData.length > 0) {
        totalStudents = ttData.reduce((sum, entry) => sum + (entry.totalStudents || 0), 0);
        ttData.forEach((entry) => {
          if (entry.scheme && !schemes.includes(entry.scheme)) {
            schemes.push(entry.scheme);
          }
        });
      } else if (allocData.length > 0) {
        allocData.forEach((alloc: any) => {
          totalStudents += alloc.assignedCount || 0;
          if (alloc.scheme && !schemes.includes(alloc.scheme)) {
            schemes.push(alloc.scheme);
          }
        });
      }

      // Skip if no students
      if (totalStudents === 0) {
        setSessions([]);
        toast.info('No students found for the selected date and session');
        return;
      }

      // Get departments
      schemes.forEach((scheme) => {
        const dept = scheme.match(/^[A-Za-z]+/)?.toString() || '';
        if (dept && !departments.includes(dept)) {
          departments.push(dept);
        }
      });

      // Calculate required staff using staffPerBlock
      const requiredSupervisors = Math.max(
        MIN_SUPERVISORS,
        Math.ceil(totalStudents / staffPerBlock) + 1,
      );
      const requiredRelievers = Math.max(1, Math.ceil(requiredSupervisors / RELIEVER_RATIO));

      const sessionKey = `${date}-${session}`;

      // Process existing orders
      const supAllottedMap: Record<string, string[]> = {};
      const relAllottedMap: Record<string, string[]> = {};

      supOrdersList.forEach((order: any) => {
        const key = `${format(new Date(order.date), 'yyyy-MM-dd')}-${order.session}`;
        if (!supAllottedMap[key]) supAllottedMap[key] = [];
        if (order.staff?.uid) supAllottedMap[key].push(order.staff.uid);
      });

      relOrdersList.forEach((order: any) => {
        const key = `${format(new Date(order.date), 'yyyy-MM-dd')}-${order.session}`;
        if (!relAllottedMap[key]) relAllottedMap[key] = [];
        if (order.staff?.uid) relAllottedMap[key].push(order.staff.uid);
      });

      setExistingSupervisorOrders(supAllottedMap);
      setExistingRelieverOrders(relAllottedMap);
      setSelectedSupervisors(supAllottedMap);
      setSelectedRelievers(relAllottedMap);

      const sessionData: SessionData = {
        date,
        session,
        totalStudents,
        requiredSupervisors,
        requiredRelievers,
        departments: departments.length > 0 ? departments : ['General'],
        schemes,
        supervisorAllotted: supAllottedMap[sessionKey] || [],
        relieverAllotted: relAllottedMap[sessionKey] || [],
      };

      setSessions([sessionData]);
      setIsAllSaved(false);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [date, session, staffPerBlock]);

  // ============================================================
  // Auto-load
  // ============================================================

  useEffect(() => {
    if (
      date &&
      session &&
      supervisors.length > 0 &&
      relievers.length > 0 &&
      !isLoadingStaffPerBlock
    ) {
      loadData();
    }
  }, [date, session, loadData, supervisors.length, relievers.length, isLoadingStaffPerBlock]);

  // ============================================================
  // Handlers
  // ============================================================

  const handleSupervisorChange = (sessionKey: string, index: number, staffUid: string) => {
    setSelectedSupervisors((prev) => {
      const current = prev[sessionKey] || [];
      const updated = [...current];
      while (updated.length <= index) updated.push('');
      updated[index] = staffUid === '#' ? '' : staffUid;
      while (updated.length > 0 && updated[updated.length - 1] === '') updated.pop();
      return { ...prev, [sessionKey]: updated };
    });
    setIsAllSaved(false);
  };

  const handleRelieverChange = (sessionKey: string, index: number, staffUid: string) => {
    setSelectedRelievers((prev) => {
      const current = prev[sessionKey] || [];
      const updated = [...current];
      while (updated.length <= index) updated.push('');
      updated[index] = staffUid === '#' ? '' : staffUid;
      while (updated.length > 0 && updated[updated.length - 1] === '') updated.pop();
      return { ...prev, [sessionKey]: updated };
    });
    setIsAllSaved(false);
  };

  const getAvailableSupervisors = (sessionKey: string, currentIndex: number) => {
    const selected = selectedSupervisors[sessionKey] || [];
    return supervisors.filter((s) => !selected.includes(s.uid) || selected[currentIndex] === s.uid);
  };

  const getAvailableRelievers = (sessionKey: string, currentIndex: number) => {
    const selected = selectedRelievers[sessionKey] || [];
    return relievers.filter((s) => !selected.includes(s.uid) || selected[currentIndex] === s.uid);
  };

  const generateOrderKey = (prefix: string, date: string, session: string, index: number) => {
    return `${prefix}-${date.replace(/-/g, '')}-${session.toUpperCase()}-${String(index + 1).padStart(2, '0')}`;
  };

  const groupedSupervisors = useMemo(() => {
    const groups = new Map<string, StaffMember[]>();
    const filtered = supervisors.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.uid.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    filtered.forEach((s) => {
      const dept = s.department || 'Unknown';
      if (!groups.has(dept)) groups.set(dept, []);
      groups.get(dept)!.push(s);
    });

    const result: GroupedStaff[] = [];
    groups.forEach((members, dept) => {
      members.sort((a, b) => a.name.localeCompare(b.name));
      result.push({ department: dept, members });
    });

    result.sort((a, b) => a.department.localeCompare(b.department));
    return result;
  }, [supervisors, searchQuery]);

  const saveAllOrders = async () => {
    if (sessions.length === 0) return;

    const sessionData = sessions[0];
    const sessionKey = `${sessionData.date}-${sessionData.session}`;

    const supSelected = selectedSupervisors[sessionKey] || [];
    const relSelected = selectedRelievers[sessionKey] || [];
    const validSup = supSelected.filter(Boolean);
    const validRel = relSelected.filter(Boolean);

    // Validate
    if (validSup.length < sessionData.requiredSupervisors) {
      toast.warning(
        `Need ${sessionData.requiredSupervisors} supervisors, selected ${validSup.length}`,
      );
      return;
    }

    if (validRel.length < sessionData.requiredRelievers) {
      toast.warning(`Need ${sessionData.requiredRelievers} relievers, selected ${validRel.length}`);
      return;
    }

    // Check duplicates
    const uniqueSup = new Set(validSup);
    const uniqueRel = new Set(validRel);
    if (uniqueSup.size !== validSup.length) {
      toast.error('Duplicate supervisors selected');
      return;
    }
    if (uniqueRel.size !== validRel.length) {
      toast.error('Duplicate relievers selected');
      return;
    }

    setSaving(true);
    try {
      const dateObj = new Date(sessionData.date);

      // Delete existing orders
      const [existingSup, existingRel] = await Promise.all([
        getOrders({ orderType: 'supervision', date: dateObj }),
        getOrders({ orderType: 'reliever', date: dateObj }),
      ]);

      if (existingSup && existingSup.length > 0) {
        for (const order of existingSup) {
          if (order.id) await deleteOrder(order.id);
        }
      }
      if (existingRel && existingRel.length > 0) {
        for (const order of existingRel) {
          if (order.id) await deleteOrder(order.id);
        }
      }

      // Create supervisor orders
      const supPromises = validSup.map((uid, index) => {
        const member = supervisors.find((s) => s.uid === uid);
        if (!member) return null;
        return createOrder({
          staffId: member.id,
          orderType: 'supervision',
          date: dateObj,
          session: sessionData.session,
          orderKey: generateOrderKey('SUP', sessionData.date, sessionData.session, index),
        });
      });

      // Create reliever orders
      const relPromises = validRel.map((uid, index) => {
        const member = relievers.find((s) => s.uid === uid);
        if (!member) return null;
        return createOrder({
          staffId: member.id,
          orderType: 'reliever',
          date: dateObj,
          session: sessionData.session,
          orderKey: generateOrderKey('REL', sessionData.date, sessionData.session, index),
        });
      });

      const results = await Promise.all(
        [...supPromises, ...relPromises].filter(
          (promise): promise is Promise<any> => promise !== null,
        ),
      );

      // Update state
      setExistingSupervisorOrders((prev) => ({ ...prev, [sessionKey]: validSup }));
      setExistingRelieverOrders((prev) => ({ ...prev, [sessionKey]: validRel }));
      setIsAllSaved(true);

      toast.success(
        `Created ${results.length} orders (${validSup.length} supervisors, ${validRel.length} relievers)`,
      );

      // Refresh
      await loadData();
    } catch (error) {
      console.error('Error saving orders:', error);
      toast.error('Failed to save orders');
    } finally {
      setSaving(false);
    }
  };

  const isSaveEnabled = () => {
    if (sessions.length === 0) return false;
    const sessionData = sessions[0];
    const sessionKey = `${sessionData.date}-${sessionData.session}`;
    const supSelected = selectedSupervisors[sessionKey] || [];
    const relSelected = selectedRelievers[sessionKey] || [];
    const validSup = supSelected.filter(Boolean).length;
    const validRel = relSelected.filter(Boolean).length;
    return (
      validSup === sessionData.requiredSupervisors &&
      validRel === sessionData.requiredRelievers &&
      !saving &&
      !isAllSaved
    );
  };

  const getStaffName = (uid: string, type: 'supervisor' | 'reliever') => {
    const pool = type === 'supervisor' ? supervisors : relievers;
    const member = pool.find((s) => s.uid === uid);
    return member ? `${member.name} (${getDept(member.department)})` : uid;
  };

  // ============================================================
  // Render
  // ============================================================

  if (userLoading || isLoadingStaffPerBlock) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const sessionData = sessions.length > 0 ? sessions[0] : null;
  const sessionKey = sessionData ? `${sessionData.date}-${sessionData.session}` : '';

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Supervision & Reliever Orders</CardTitle>
          <CardDescription>
            Generate and manage supervision and reliever orders for examination sessions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-48"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Session</label>
              <Select
                value={session}
                onValueChange={(v: 'Morning' | 'Afternoon') => setSession(v)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select session" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Morning">Morning</SelectItem>
                  <SelectItem value="Afternoon">Afternoon</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-end gap-2">
              <Button
                onClick={loadData}
                disabled={loading}
                className="h-10"
              >
                <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
                {loading ? 'Loading...' : 'Load Data'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* No Data State */}
      {!loading && sessions.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground p-12 text-center">
            <UserX className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="text-lg font-medium">No students found</p>
            <p className="text-sm">Select a date and session with student data</p>
          </CardContent>
        </Card>
      )}

      {/* Session Card */}
      {!loading && sessionData && (
        <Card className="shadow-md transition-shadow hover:shadow-lg">
          <CardHeader className="">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl font-bold">
                  <Calendar className="h-5 w-5" />
                  {new Date(sessionData.date).toLocaleDateString('en-IN', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                  <Badge
                    variant="outline"
                    className="ml-2"
                  >
                    <Clock className="mr-1 h-3 w-3" />
                    {sessionData.session}
                  </Badge>
                </CardTitle>
                <CardDescription className="mt-2">
                  <div className="flex flex-wrap gap-2">
                    {sessionData.departments.map((dept, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="bg-blue-50 text-blue-700"
                      >
                        {getDept(dept)}
                      </Badge>
                    ))}
                  </div>
                  {sessionData.schemes.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {sessionData.schemes.map((scheme, idx) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className="text-xs"
                        >
                          {scheme}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 rounded-lg bg-green-100 px-3 py-2">
                  <Users className="h-4 w-4 text-green-700" />
                  <span className="font-bold">{sessionData.totalStudents}</span>
                  <span className="text-xs text-green-700">Students</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-purple-100 px-3 py-2">
                  <UserCheck className="h-4 w-4 text-purple-700" />
                  <span className="font-bold">{sessionData.requiredSupervisors}</span>
                  <span className="text-xs text-purple-700">Supervisors</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-indigo-100 px-3 py-2">
                  <Users2 className="h-4 w-4 text-indigo-700" />
                  <span className="font-bold">{sessionData.requiredRelievers}</span>
                  <span className="text-xs text-indigo-700">Relievers</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-blue-100 px-3 py-2">
                  <BarChart className="h-4 w-4 text-blue-700" />
                  <span className="font-bold">{staffPerBlock}</span>
                  <span className="text-xs text-blue-700">Avg Strength</span>
                </div>
              </div>
            </div>
          </CardHeader>

          <Separator />

          <CardContent className="space-y-8 p-6">
            {/* Supervisors Section */}
            <div>
              <div className="mb-4 flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-purple-600" />
                <h3 className="text-lg font-semibold">Supervisors</h3>
                <Badge
                  variant="outline"
                  className="ml-2"
                >
                  {sessionData.requiredSupervisors} required
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    (selectedSupervisors[sessionKey] || []).filter(Boolean).length ===
                      sessionData.requiredSupervisors
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700',
                  )}
                >
                  {(selectedSupervisors[sessionKey] || []).filter(Boolean).length} /{' '}
                  {sessionData.requiredSupervisors} assigned
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: sessionData.requiredSupervisors }).map((_, index) => {
                  const existingUid = existingSupervisorOrders[sessionKey]?.[index] || '';
                  const currentUid =
                    (selectedSupervisors[sessionKey] || [])[index] || existingUid || '';
                  const isFilled = !!currentUid;

                  return (
                    <div
                      key={index}
                      className={cn(
                        'space-y-1 rounded-lg border p-3 transition-all',
                        isFilled
                          ? 'border-green-200 bg-green-50/50'
                          : 'border-dashed border-neutral-200',
                      )}
                    >
                      <label className="flex items-center gap-2 text-sm font-medium">
                        Supervisor {index + 1}
                        {existingUid && (
                          <Badge
                            variant="outline"
                            className="border-green-200 bg-green-50 text-xs text-green-700"
                          >
                            Existing
                          </Badge>
                        )}
                      </label>
                      <Select
                        value={currentUid || '#'}
                        onValueChange={(value) => handleSupervisorChange(sessionKey, index, value)}
                      >
                        <SelectTrigger className={cn('w-full', !isFilled && 'border-dashed')}>
                          <SelectValue placeholder="Select supervisor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="#">Clear</SelectItem>
                          {groupedSupervisors.map((group, groupIndex) => (
                            <SelectGroup key={group.department}>
                              <SelectLabel>{getDept(group.department)}</SelectLabel>
                              {group.members.map((staff) => {
                                const isDisabled =
                                  getAvailableSupervisors(sessionKey, index).every(
                                    (s) => s.uid !== staff.uid,
                                  ) && staff.uid !== currentUid;
                                return (
                                  <SelectItem
                                    key={staff.uid}
                                    value={staff.uid}
                                    disabled={isDisabled}
                                  >
                                    {staff.name} ({staff.uid})
                                  </SelectItem>
                                );
                              })}
                              {groupIndex < groupedSupervisors.length - 1 && <SelectSeparator />}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                      {currentUid && (
                        <div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          {getStaffName(currentUid, 'supervisor')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Relievers Section */}
            <div>
              <div className="mb-4 flex items-center gap-2">
                <Users2 className="h-5 w-5 text-indigo-600" />
                <h3 className="text-lg font-semibold">Relievers</h3>
                <Badge
                  variant="outline"
                  className="ml-2"
                >
                  {sessionData.requiredRelievers} required
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    (selectedRelievers[sessionKey] || []).filter(Boolean).length ===
                      sessionData.requiredRelievers
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700',
                  )}
                >
                  {(selectedRelievers[sessionKey] || []).filter(Boolean).length} /{' '}
                  {sessionData.requiredRelievers} assigned
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: sessionData.requiredRelievers }).map((_, index) => {
                  const existingUid = existingRelieverOrders[sessionKey]?.[index] || '';
                  const currentUid =
                    (selectedRelievers[sessionKey] || [])[index] || existingUid || '';
                  const isFilled = !!currentUid;

                  return (
                    <div
                      key={index}
                      className={cn(
                        'space-y-1 rounded-lg border p-3 transition-all',
                        isFilled
                          ? 'border-green-200 bg-green-50/50'
                          : 'border-dashed border-neutral-200',
                      )}
                    >
                      <label className="flex items-center gap-2 text-sm font-medium">
                        Reliever {index + 1}
                        {existingUid && (
                          <Badge
                            variant="outline"
                            className="border-green-200 bg-green-50 text-xs text-green-700"
                          >
                            Existing
                          </Badge>
                        )}
                      </label>
                      <Select
                        value={currentUid || '#'}
                        onValueChange={(value) => handleRelieverChange(sessionKey, index, value)}
                      >
                        <SelectTrigger className={cn('w-full', !isFilled && 'border-dashed')}>
                          <SelectValue placeholder="Select reliever" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="#">Clear</SelectItem>
                          {getAvailableRelievers(sessionKey, index).map((staff) => (
                            <SelectItem
                              key={staff.uid}
                              value={staff.uid}
                            >
                              {staff.name} ({staff.department})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {currentUid && (
                        <div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          {getStaffName(currentUid, 'reliever')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>

          <CardFooter className="bg-muted/30 flex items-center justify-between p-4">
            <div className="text-muted-foreground text-sm">
              {isAllSaved ? (
                <span className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  All orders saved
                </span>
              ) : (
                <span>
                  {selectedSupervisors[sessionKey]?.filter(Boolean).length || 0} supervisors,
                  {selectedRelievers[sessionKey]?.filter(Boolean).length || 0} relievers assigned
                </span>
              )}
            </div>
            <Button
              onClick={saveAllOrders}
              disabled={!isSaveEnabled()}
              className="flex items-center gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving...' : isAllSaved ? 'Saved' : 'Save All Orders'}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="p-12 text-center">
            <Loader2 className="text-primary mx-auto h-8 w-8 animate-spin" />
            <p className="text-muted-foreground mt-4 text-sm">Loading session data...</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
