// components/shared/session-selector.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

import { format } from 'date-fns';
import { AlertCircle, CalendarIcon, ChevronRight, Clock, Loader2, Zap } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionData, SessionInfo, SessionSelectorProps } from '@/lib/types';
import { cn } from '@/lib/utils';

import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

// ============================================================================
// Types
// ============================================================================

// ============================================================================
// TEMPORARY: Quick Select Configuration
// ============================================================================
const QUICK_SELECT = {
  date: '2024-12-17',
  session: 'Afternoon' as const,
  enabled: true, // Set to false to hide the button
};

// ============================================================================
// Main Component
// ============================================================================

export function SessionSelector({
  onSessionSelect,
  onCancel,
  availableDates = [],
  availableSessions = ['Morning', 'Afternoon'],
  isLoading = false,
  error: externalError = null,
  defaultDate = '',
  defaultSession = '',
  title = 'Select Examination Session',
  description = 'Choose a date and session to continue',
  className,
  compact = false,
  validateSession,
  onDateChange,
  onSessionChange,
  showMetadata = false,
  metadataRenderer,
  actions = [],
}: SessionSelectorProps) {
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [selectedSession, setSelectedSession] = useState(defaultSession);
  const [isValidating, setIsValidating] = useState(false);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [internalError, setInternalError] = useState<string | null>(null);

  const error = externalError || validationError || internalError;
  const isValid = selectedDate && selectedSession;

  // Update internal state when props change
  useEffect(() => {
    if (defaultDate) setSelectedDate(defaultDate);
  }, [defaultDate]);

  useEffect(() => {
    if (defaultSession) setSelectedSession(defaultSession);
  }, [defaultSession]);

  // Handle date change
  const handleDateChange = (value: string) => {
    setSelectedDate(value);
    setValidationError(null);
    setSessionData(null);
    onDateChange?.(value);
  };

  // Handle session change
  const handleSessionChange = (value: string) => {
    setSelectedSession(value);
    setValidationError(null);
    setSessionData(null);
    onSessionChange?.(value);
  };

  // Quick select handler
  const handleQuickSelect = async () => {
    if (!QUICK_SELECT.enabled) return;

    setSelectedDate(QUICK_SELECT.date);
    setSelectedSession(QUICK_SELECT.session);
    setValidationError(null);
    setSessionData(null);

    onDateChange?.(QUICK_SELECT.date);
    onSessionChange?.(QUICK_SELECT.session);

    // Auto confirm
    if (validateSession) {
      setIsValidating(true);
      try {
        const result = await validateSession(QUICK_SELECT.date, QUICK_SELECT.session);
        if (!result.valid) {
          setValidationError(result.message || 'Invalid session selection');
          return;
        }
        if (result.data) {
          setSessionData(result.data);
        }
      } catch (err) {
        setInternalError(err instanceof Error ? err.message : 'Validation failed');
        return;
      } finally {
        setIsValidating(false);
      }
    }

    await onSessionSelect({ date: QUICK_SELECT.date, session: QUICK_SELECT.session });
  };

  // Validate and confirm session
  const handleConfirm = async () => {
    if (!selectedDate || !selectedSession) {
      setValidationError('Please select both date and session');
      return;
    }

    if (validateSession) {
      setIsValidating(true);
      setValidationError(null);

      try {
        const result = await validateSession(selectedDate, selectedSession);

        if (!result.valid) {
          setValidationError(result.message || 'Invalid session selection');
          return;
        }

        if (result.data) {
          setSessionData(result.data);
        }
      } catch (err) {
        setInternalError(err instanceof Error ? err.message : 'Validation failed');
        return;
      } finally {
        setIsValidating(false);
      }
    }

    await onSessionSelect({ date: selectedDate, session: selectedSession as 'Morning' | 'Afternoon' });
  };

  // Handle cancel
  const handleCancel = () => {
    setSelectedDate('');
    setSelectedSession('');
    setValidationError(null);
    setSessionData(null);
    onCancel?.();
  };

  // Loading state
  if (isLoading) {
    return (
      <Card className={cn('shadow-sm', className)}>
        <CardHeader className={compact ? 'pb-3' : 'pb-4'}>
          <Skeleton className={compact ? 'h-5 w-32' : 'h-6 w-40'} />
          <Skeleton className="mt-1 h-3 w-48" />
        </CardHeader>
        <CardContent className={compact ? 'space-y-3' : 'space-y-4'}>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-24" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('mx-auto w-auto shadow-sm', className, compact && 'max-w-xl')}>
      {/* TEMPORARY: Quick Select Button - Shows only when enabled */}
      {QUICK_SELECT.enabled && (
        <div className="m-auto">
          <Button
            onClick={handleQuickSelect}
            variant="outline"
            size="sm"
            className="gap-2 border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
          >
            <Zap className="h-3.5 w-3.5" />
            Quick: {format(new Date(QUICK_SELECT.date), 'dd MMM')} · {QUICK_SELECT.session}
          </Button>
        </div>
      )}

      <CardHeader className={compact ? 'pb-3' : 'pb-4'}>
        <CardTitle className={cn('flex items-center gap-2', compact ? 'text-base' : 'text-lg')}>
          <CalendarIcon className={cn('text-muted-foreground', compact ? 'h-4 w-4' : 'h-5 w-5')} />
          {title}
        </CardTitle>
        {description && <CardDescription className={compact ? 'text-xs' : 'text-sm'}>{description}</CardDescription>}
      </CardHeader>

      <CardContent className={cn('space-y-4', compact && 'space-y-3')}>
        {/* Date Selector */}
        <div className="w-full space-y-1.5">
          <Label className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>Examination Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />

                {selectedDate ? format(new Date(selectedDate), 'dd MMMM yyyy') : 'Select examination date'}
              </Button>
            </PopoverTrigger>

            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                captionLayout="dropdown"
                startMonth={new Date(2020, 0)}
                endMonth={new Date(2035, 11)}
                selected={selectedDate ? new Date(selectedDate) : undefined}
                onSelect={date => {
                  if (date) {
                    handleDateChange(format(date, 'yyyy-MM-dd'));
                  }
                }}
                disabled={date => {
                  const dateString = format(date, 'yyyy-MM-dd');

                  return !availableDates.some(d => format(d, 'yyyy-MM-dd') === dateString);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Session Selector */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleSessionChange('Morning')}
            className={cn(
              'rounded-lg border p-4 text-left transition-all',
              selectedSession === 'Morning' ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/30'
            )}
          >
            <p className="font-medium">Morning</p>
            <p className="text-muted-foreground text-xs">09:00 AM – 12:00 PM</p>
          </button>

          <button
            type="button"
            onClick={() => handleSessionChange('Afternoon')}
            className={cn(
              'rounded-lg border p-4 text-left transition-all',
              selectedSession === 'Afternoon' ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/30'
            )}
          >
            <p className="font-medium">Afternoon</p>
            <p className="text-muted-foreground text-xs">02:00 PM – 05:00 PM</p>
          </button>
        </div>

        {/* Metadata Display */}
        {showMetadata && sessionData && metadataRenderer && (
          <div className="bg-muted/50 rounded-md p-3">{metadataRenderer(sessionData)}</div>
        )}

        {/* Error Display */}
        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-3.5 w-3.5" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className={cn('flex gap-2', compact ? 'pt-1' : 'pt-2')}>
          <Button
            onClick={handleConfirm}
            disabled={!isValid || isValidating}
            size={compact ? 'sm' : 'default'}
            className="flex-1"
          >
            {isValidating ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Validating...
              </>
            ) : (
              <>
                Continue
                <ChevronRight className="ml-2 h-3.5 w-3.5" />
              </>
            )}
          </Button>

          {onCancel && (
            <Button onClick={handleCancel} variant="outline" size={compact ? 'sm' : 'default'} type="button">
              Cancel
            </Button>
          )}

          {actions.map((action, idx) => (
            <Button
              key={idx}
              onClick={action.onClick}
              variant={action.variant || 'outline'}
              size={compact ? 'sm' : 'default'}
              disabled={action.disabled}
              className="gap-1.5"
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Compact Version for Sidebars/Modals
// ============================================================================

export function CompactSessionSelector(props: Omit<SessionSelectorProps, 'compact'>) {
  return <SessionSelector {...props} compact />;
}

// ============================================================================
// Hook for managing session state
// ============================================================================

export interface UseSessionSelectorOptions {
  initialDate?: string;
  initialSession?: string;
  autoLoad?: boolean;
  onSessionChange?: (session: SessionInfo) => void;
}

export function useSessionSelector(options: UseSessionSelectorOptions = {}) {
  const { initialDate = '', initialSession = '', autoLoad = false, onSessionChange } = options;

  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectSession = useCallback(
    async (session: SessionInfo) => {
      setIsSelecting(true);
      setError(null);
      try {
        setSelectedSession(session);
        await onSessionChange?.(session);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to select session');
        throw err;
      } finally {
        setIsSelecting(false);
      }
    },
    [onSessionChange]
  );

  const clearSession = useCallback(() => {
    setSelectedSession(null);
    setError(null);
  }, []);

  // Auto-load initial session if provided
  useEffect(() => {
    if (autoLoad && initialDate && initialSession && !selectedSession) {
      selectSession({ date: initialDate, session: initialSession as 'Morning' | 'Afternoon' });
    }
  }, [autoLoad, initialDate, initialSession, selectedSession, selectSession]);

  return {
    selectedSession,
    isSelecting,
    error,
    selectSession,
    clearSession,
  };
}
