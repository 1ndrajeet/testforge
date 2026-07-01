import departmentMap from '@/config/course_codes.json';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// lib/utils.ts
export function getAuthHeaders(): HeadersInit {
  return {};
}

interface ParsedScheme {
  courseCode: string;
  courseName: string;
  semester: string;
  master: string;
}

export const getCourseName = (code: string): string => {
  const map = departmentMap as Record<string, string>;
  return map[code] || code;
};
export function parseScheme(scheme: string): ParsedScheme {
  if (!scheme) {
    return { courseCode: '', courseName: '', semester: '', master: '' };
  }

  // Remove any extra characters and trim
  const clean = scheme.trim().toUpperCase();

  // Try to match pattern: letters + numbers (e.g., "EE6E", "ME6I", "CE5I")
  // Or with hyphens: "EE-6-I", "ME-6-I", "CE-5-I"
  // Or with dashes: "EE6E", "ME6I"

  // Case 1: Has hyphens - "EE-6-I", "ME-6-I"
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length >= 3) {
      return {
        courseCode: parts[0] || '',
        courseName: getCourseName(parts[0] || ''),
        semester: parts[1] || '',
        master: parts[2] || '',
      };
    }
    if (parts.length === 2) {
      // Try to extract from "EE-6"
      const course = parts[0] || '';
      const rest = parts[1] || '';
      // If rest has letters, treat as master
      const match = rest.match(/^(\d+)([A-Z])?$/);
      if (match) {
        return {
          courseCode: course,
          courseName: getCourseName(course),
          semester: match[1] || '',
          master: match[2] || '',
        };
      }
      return {
        courseCode: course,
        courseName: getCourseName(course),
        semester: rest || '',
        master: '',
      };
    }
    return {
      courseCode: clean,
      courseName: getCourseName(clean),
      semester: '',
      master: '',
    };
  }

  // Case 2: No hyphens - "EE6E", "ME6I", "CE5I"
  // Format: COURSE + SEMESTER + MASTER (optional)
  // e.g., EE6E -> course: EE, semester: 6, master: E
  // e.g., EE6 -> course: EE, semester: 6, master: ''
  // e.g., AE3I -> course: AE, semester: 3, master: I

  // Try to extract course code (letters at start)
  const courseMatch = clean.match(/^([A-Z]+)/);
  if (!courseMatch) {
    return { courseCode: clean, courseName: getCourseName(clean), semester: '', master: '' };
  }

  const courseCode = courseMatch[1];
  const rest = clean.slice(courseCode.length);

  // Extract semester (digits) and master (remaining letters)
  const semesterMatch = rest.match(/^(\d+)/);
  if (!semesterMatch) {
    return { courseCode, courseName: getCourseName(courseCode), semester: '', master: '' };
  }

  const semester = semesterMatch[1];
  const master = rest.slice(semester.length) || '';

  return {
    courseCode,
    courseName: getCourseName(courseCode),
    semester,
    master,
  };
}

// export function getAuthHeaders(): HeadersInit {
//   const sessionToken = document.cookie
//     .split('; ')
//     .find(row => row.startsWith('better-auth.session_token='))
//     ?.split('=')[1];

//   return sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {};
// }
