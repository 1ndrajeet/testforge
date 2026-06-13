// // src/hooks/useUser.ts
// 'use client';

// import { useEffect, useState } from 'react';

// import { authClient } from '@/lib/auth-client';

// import { useAppStore } from '@/stores/appStore';

// interface User {
//   id: string;
//   name: string;
//   email: string;
//   image?: string | null;
//   createdAt: Date;
// }

// interface Session {
//   user: User;
//   session: {
//     id: string;
//     expiresAt: Date;
//     token: string;
//   };
// }

// export function useUser() {
//   const [user, setUser] = useState<User | null>(null);
//   const [session, setSession] = useState<Session | null>(null);
//   const [isLoading, setIsLoading] = useState(true);

//   // Get store state and setters
//   const {
//     isInitialized,
//     setInitialized,
//     setOrganizationFromDB,
//     setExamCenterFromDB,
//     reset
//   } = useAppStore();

//   useEffect(() => {
//     const fetchUserAndData = async () => {
//       try {
//         // Fetch session
//         const { data } = await authClient.getSession();

//         if (data?.user) {
//           setUser(data.user);
//           setSession(data as Session);

//           // Fetch organization and exam center data
//           const statusRes = await fetch('/api/user/status');
//           const statusData = await statusRes.json();

//           if (statusData.organization) {
//             setOrganizationFromDB(statusData.organization);
//           }

//           if (statusData.examCenter) {
//             setExamCenterFromDB(statusData.examCenter);
//           }
//         }

//         // Mark as initialized regardless of whether user is logged in
//         setInitialized(true);
//       } catch (error) {
//         console.error('Failed to fetch user:', error);
//         setInitialized(true); // Still mark as initialized to avoid infinite loading
//       } finally {
//         setIsLoading(false);
//       }
//     };

//     fetchUserAndData();
//   }, [setInitialized, setOrganizationFromDB, setExamCenterFromDB]);

//   const signOut = async () => {
//     if (!confirm('Are you sure you want to sign out?')) return;
//     await authClient.signOut();
//     setUser(null);
//     setSession(null);
//     reset(); // Reset store state
//     window.location.href = '/login';
//   };

//   return { user, session, isLoading, signOut, isInitialized };
// }
