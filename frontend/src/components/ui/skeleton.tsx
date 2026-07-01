import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'bg-muted relative overflow-hidden rounded-md',
        'before:absolute before:inset-0',
        'before:-translate-x-full',
        'before:animate-[shimmer_1.8s_infinite]',
        'before:bg-gradient-to-r',
        'before:from-transparent',
        'before:via-white/10',
        'before:to-transparent',
        'dark:before:via-white/5',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };

export function TableSkeleton({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {/* Header */}
      <div className="flex gap-4 border-b pb-3">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={i}
            className="h-4 w-24 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800"
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 py-3"
        >
          {Array.from({ length: columns }).map((_, j) => (
            <div
              key={j}
              className="h-4 w-24 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border p-6', className)}>
      <div className="mb-4 h-5 w-32 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="space-y-3">
        <div className="h-4 w-full animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
      </div>
    </div>
  );
}

export function PageSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6', className)}>
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-4 w-64 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
      </div>
      <div className="h-16 w-full animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
      <div className="flex gap-4">
        <div className="h-8 w-36 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
        <div className="h-8 w-36 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
        <div className="ml-auto h-8 w-24 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
      </div>
      <div className="space-y-2">
        <div className="h-10 w-full animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
        <div className="h-10 w-full animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
        <div className="h-10 w-full animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
      </div>
    </div>
  );
}
