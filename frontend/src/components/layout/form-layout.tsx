// components/ui/form-layout.tsx
'use client';

import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, required, error, hint, children, className }: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label}
        {required && <span className="ml-0.5 text-rose-400">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {hint && !error && <p className="text-xs text-neutral-400 dark:text-neutral-500">{hint}</p>}
    </div>
  );
}

interface FormSectionProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function FormSection({ title, children, className }: FormSectionProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {title && (
        <div className="border-b border-neutral-100 pb-2 dark:border-neutral-800">
          <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
            {title}
          </h3>
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

interface FormActionsProps {
  onCancel?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  children?: ReactNode;
  className?: string;
}

export function FormActions({
  onCancel,
  onSave,
  isSaving = false,
  saveLabel = 'Save Changes',
  cancelLabel = 'Cancel',
  children,
  className,
}: FormActionsProps) {
  return (
    <div
      className={cn(
        'mt-6 flex items-center justify-end gap-3 border-t border-neutral-100 pt-6 dark:border-neutral-800',
        className,
      )}
    >
      {children}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          {cancelLabel}
        </button>
      )}
      {onSave && (
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="bg-primary hover:bg-primary focus:ring-primary inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving && (
            <svg
              className="mr-2 h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          )}
          {saveLabel}
        </button>
      )}
    </div>
  );
}
