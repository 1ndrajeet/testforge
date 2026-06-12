import type { Metadata } from 'next';
import { Inter, Montserrat } from 'next/font/google';

import { AuthProvider } from '@/components/auth/AuthProvider';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';

import { cn } from '@/lib/utils';

import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

const font = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
});

export const metadata: Metadata = {
  title: 'TestForge',
  description: 'A platform for MSBTE institions for managing end semester exams with ease',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn('h-full', 'antialiased', font.variable, 'font-sans', inter.variable)}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider>{children}</TooltipProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
