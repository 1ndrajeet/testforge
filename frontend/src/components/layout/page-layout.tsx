// components/layout/page-layout.tsx
'use client';

import { ReactNode, useState } from 'react';

import { LucideIcon } from 'lucide-react';
import { Filter, Search, X } from 'lucide-react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  badge?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, icon: Icon, badge, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-8 space-y-2', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="bg-primary/80 text-primary-foreground flex h-10 w-10 items-center justify-center rounded-xl">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              {title}
            </h1>
            {badge && (
              <span className="ml-2 inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                {badge}
              </span>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {description && <p className="text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
    </div>
  );
}

export interface FilterOption {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  value?: string;
}

export interface ActionOption {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
}

interface PageToolbarProps {
  filters?: FilterOption[];
  onFilterChange?: (filterId: string, value: string) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  actions?: ActionOption[];
  className?: string;
  disableSearch?: boolean;
}

export function PageToolbar({
  filters = [],
  onFilterChange,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  actions = [],
  className,
  disableSearch = false,
}: PageToolbarProps) {
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const hasFilters = filters.length > 0;
  const hasSearch = !!onSearchChange;
  const hasActions = actions.length > 0;

  if (!hasFilters && !hasSearch && !hasActions) return null;

  return (
    <div className={cn('mb-6', className)}>
      {/* Desktop */}
      <div className="hidden flex-wrap items-center justify-between gap-4 md:flex">
        <div className="flex flex-wrap items-center gap-3">
          {hasFilters && (
            <div className="flex items-center gap-2">
              {filters.map(filter => (
                <Select
                  key={filter.id}
                  value={filter.value || 'all'}
                  onValueChange={value => onFilterChange?.(filter.id, value)}
                >
                  <SelectTrigger className="h-8 w-36 text-sm">
                    <SelectValue placeholder={filter.label} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All {filter.label}</SelectItem>
                    {filter.options.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
            </div>
          )}
          {hasSearch && (
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                type="text"
                disabled={disableSearch}
                value={searchValue}
                onChange={e => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 w-80 pr-8 pl-9 text-sm"
              />
              {searchValue && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
        {hasActions && (
          <div className="flex items-center gap-2">
            {actions.map(action => (
              <Button
                key={action.id}
                variant={action.variant || 'outline'}
                size="sm"
                onClick={action.onClick}
                className="h-8 gap-1.5 text-sm"
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Mobile */}
      <div className="flex flex-col gap-3 md:hidden">
        <div className="flex items-center gap-2">
          {hasSearch && (
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                type="text"
                value={searchValue}
                onChange={e => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 w-full pr-8 pl-9 text-sm"
              />
            </div>
          )}
          {hasFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="h-9 gap-1.5"
            >
              <Filter className="h-4 w-4" />
              Filters
            </Button>
          )}
        </div>
        {showMobileFilters && hasFilters && (
          <div className="flex flex-wrap gap-2">
            {filters.map(filter => (
              <Select
                key={filter.id}
                value={filter.value || 'all'}
                onValueChange={value => onFilterChange?.(filter.id, value)}
              >
                <SelectTrigger className="h-8 min-w-[120px] flex-1 text-sm">
                  <SelectValue placeholder={filter.label} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All {filter.label}</SelectItem>
                  {filter.options.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
          </div>
        )}
        {hasActions && (
          <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
            {actions.map(action => (
              <Button
                key={action.id}
                variant={action.variant || 'outline'}
                size="sm"
                onClick={action.onClick}
                className="flex-1 gap-1.5 text-sm"
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface PageSectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}

export function PageSection({
  title,
  description,
  children,
  className,
  headerClassName,
  contentClassName,
}: PageSectionProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {(title || description) && (
        <div className={cn('space-y-1', headerClassName)}>
          {title && <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>}
          {description && <p className="text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
        </div>
      )}
      <div className={cn('space-y-4', contentClassName)}>{children}</div>
    </div>
  );
}

interface ActionBarProps {
  primary?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
  secondary?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  tertiary?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'between';
  note?: string;
}

export function ActionBar({
  primary,
  secondary,
  tertiary,
  children,
  className,
  align = 'right',
  note,
}: ActionBarProps) {
  const primaryButton = primary && (
    <button
      onClick={primary.onClick}
      disabled={primary.disabled || primary.loading}
      className={cn(
        'bg-primary hover:bg-primary focus:ring-ring inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        primary.loading && 'cursor-wait'
      )}
    >
      {primary.loading && (
        <svg className="mr-2 h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {primary.label}
    </button>
  );

  const secondaryButton = secondary && (
    <button
      onClick={secondary.onClick}
      disabled={secondary.disabled}
      className="focus:ring-ring rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-900"
    >
      {secondary.label}
    </button>
  );

  const tertiaryButton = tertiary && (
    <button
      onClick={tertiary.onClick}
      disabled={tertiary.disabled}
      className="rounded-md px-4 py-2 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-700 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-300"
    >
      {tertiary.label}
    </button>
  );

  const buttonGroup = (
    <div className="flex items-center gap-3">
      {tertiaryButton}
      {secondaryButton}
      {primaryButton}
      {children}
    </div>
  );

  return (
    <div className={cn('mt-8 border-t border-neutral-100 pt-6 dark:border-neutral-800', className)}>
      <div
        className={cn(
          'flex items-center',
          align === 'left' && 'justify-start',
          align === 'right' && 'justify-end',
          align === 'between' && 'justify-between'
        )}
      >
        {note && <p className="text-xs text-neutral-400">{note}</p>}
        {align === 'between' && note && buttonGroup}
        {align !== 'between' && buttonGroup}
        {align === 'between' && !note && buttonGroup}
      </div>
    </div>
  );
}

interface PageStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageLoading({ title = 'Loading...', description, className }: PageStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <Loader2 className="text-primary h-8 w-8 animate-spin" />
      {title && <p className="mt-4 text-sm font-medium text-neutral-900">{title}</p>}
      {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
    </div>
  );
}

export function PageError({
  title = 'Something went wrong',
  description = 'Please try again or contact support.',
  action,
  className,
}: PageStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <AlertCircle className="h-8 w-8 text-rose-500" />
      <p className="mt-4 text-sm font-medium text-neutral-900">{title}</p>
      <p className="mt-1 text-sm text-neutral-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageEmpty({
  title = 'No data found',
  description = 'Try adjusting your filters or add new data.',
  action,
  className,
}: PageStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <Search className="h-8 w-8 text-neutral-400" />
      <p className="mt-4 text-sm font-medium text-neutral-900">{title}</p>
      <p className="mt-1 text-sm text-neutral-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageSuccess({
  title = 'Success!',
  description = 'Operation completed successfully.',
  action,
  className,
}: PageStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <CheckCircle2 className="text-primary h-8 w-8" />
      <p className="mt-4 text-sm font-medium text-neutral-900">{title}</p>
      <p className="mt-1 text-sm text-neutral-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
