// lib/misc/local-storage.ts

export interface LocalAllocation {
  id: string; // temporary client-side ID
  blockName: string;
  scheme: string;
  subCode: string;
  supervisor: string;
  numberOfCandidates: number;
  startFrom: number;
  timeslot: string;
  createdAt: string;
}

export interface LocalTimetableRemaining {
  date: string;
  session: string;
  entries: {
    scheme: string;
    subjectCode: string;
    subjectName: string;
    totalStudents: number;
    timeSlot: string;
    allocatedCount: number;
  }[];
}

const STORAGE_KEYS = {
  TEMP_ALLOCATIONS: 'temp_block_allocations',
  TEMP_TIMETABLE: 'temp_timetable_state',
  SESSION_CONTEXT: 'temp_session_context',
} as const;

export function getSessionContext(): { date: string; session: string } | null {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem(STORAGE_KEYS.SESSION_CONTEXT);
  return data ? JSON.parse(data) : null;
}

export function setSessionContext(date: string, session: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.SESSION_CONTEXT, JSON.stringify({ date, session }));
}

export function clearSessionContext(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.SESSION_CONTEXT);
}

export function getLocalAllocations(): LocalAllocation[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(STORAGE_KEYS.TEMP_ALLOCATIONS);
  return data ? JSON.parse(data) : [];
}

export function addLocalAllocation(
  allocation: Omit<LocalAllocation, 'id' | 'createdAt'>,
): LocalAllocation {
  const newAllocation: LocalAllocation = {
    ...allocation,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  const current = getLocalAllocations();
  localStorage.setItem(STORAGE_KEYS.TEMP_ALLOCATIONS, JSON.stringify([...current, newAllocation]));
  return newAllocation;
}

export function removeLocalAllocation(id: string): void {
  const current = getLocalAllocations();
  localStorage.setItem(
    STORAGE_KEYS.TEMP_ALLOCATIONS,
    JSON.stringify(current.filter((a) => a.id !== id)),
  );
}

export function clearLocalAllocations(): void {
  localStorage.removeItem(STORAGE_KEYS.TEMP_ALLOCATIONS);
}

export function getLocalTimetable(): LocalTimetableRemaining | null {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem(STORAGE_KEYS.TEMP_TIMETABLE);
  return data ? JSON.parse(data) : null;
}

export function setLocalTimetable(timetable: LocalTimetableRemaining): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.TEMP_TIMETABLE, JSON.stringify(timetable));
}

export function updateLocalTimetable(scheme: string, allocatedCount: number): void {
  const current = getLocalTimetable();
  if (!current) return;

  const updatedEntries = current.entries
    .map((entry) =>
      entry.scheme === scheme
        ? {
            ...entry,
            totalStudents: entry.totalStudents - allocatedCount,
            allocatedCount: entry.allocatedCount + allocatedCount,
          }
        : entry,
    )
    .filter((entry) => entry.totalStudents > 0);

  setLocalTimetable({ ...current, entries: updatedEntries });
}

export function clearLocalTimetable(): void {
  localStorage.removeItem(STORAGE_KEYS.TEMP_TIMETABLE);
}

export function hasLocalData(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    !!localStorage.getItem(STORAGE_KEYS.TEMP_ALLOCATIONS) ||
    !!localStorage.getItem(STORAGE_KEYS.TEMP_TIMETABLE)
  );
}
