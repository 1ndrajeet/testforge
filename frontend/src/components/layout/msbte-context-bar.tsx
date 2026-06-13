// components/layout/msbte-context-bar.tsx
'use client';

import { Building2, Calendar, Clock } from 'lucide-react';

import { cn } from '@/lib/utils';

interface MSBTEContextBarProps {
  date?: Date | string;
  session?: 'Morning' | 'Afternoon';
  season?: 'Summer' | 'Winter';
  year?: number;
  examCenter?: { code: string; name: string };
  scheme?: string;
  department?: string;
  className?: string;
  compact?: boolean;
}

export function MSBTEContextBar({
  date,
  session,
  season,
  year,
  examCenter,
  scheme,
  department,
  className,
  compact = false,
}: MSBTEContextBarProps) {
  const hasContent = date || session || season || year || examCenter || scheme || department;

  if (!hasContent) return null;

  if (compact) {
    return (
      <div
        className={cn(
          'mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-neutral-100 bg-white px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-950',
          className
        )}
      >
        {season && year && (
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              {season} {year}
            </span>
          </div>
        )}
        {date && (
          <div className="flex items-center gap-2 text-neutral-500">
            <Calendar className="h-3.5 w-3.5" />
            <span>{new Date(date).toLocaleDateString('en-IN')}</span>
          </div>
        )}
        {session && (
          <div className="flex items-center gap-2 text-neutral-500">
            <Clock className="h-3.5 w-3.5" />
            <span>{session}</span>
          </div>
        )}
        {examCenter && (
          <div className="flex items-center gap-2 text-neutral-500">
            <Building2 className="h-3.5 w-3.5" />
            <span>
              {examCenter.code} - {examCenter.name}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'mb-6 rounded-lg border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          {season && year && (
            <div>
              <p className="text-xs text-neutral-400">Examination</p>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {season} {year}
              </p>
            </div>
          )}
          {date && (
            <div>
              <p className="text-xs text-neutral-400">Date</p>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {new Date(date).toLocaleDateString('en-IN', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          )}
          {session && (
            <div>
              <p className="text-xs text-neutral-400">Session</p>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{session}</p>
            </div>
          )}
          {examCenter && (
            <div>
              <p className="text-xs text-neutral-400">Exam Center</p>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {examCenter.code} - {examCenter.name}
              </p>
            </div>
          )}
          {scheme && (
            <div>
              <p className="text-xs text-neutral-400">Scheme</p>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{scheme}</p>
            </div>
          )}
          {department && (
            <div>
              <p className="text-xs text-neutral-400">Department</p>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{department}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
