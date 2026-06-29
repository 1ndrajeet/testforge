import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// lib/utils.ts
export function getAuthHeaders(): HeadersInit {
  return {};
}

// export function getAuthHeaders(): HeadersInit {
//   const sessionToken = document.cookie
//     .split('; ')
//     .find(row => row.startsWith('better-auth.session_token='))
//     ?.split('=')[1];

//   return sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {};
// }
