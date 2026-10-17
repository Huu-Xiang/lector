import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

function Select({
  className,
  wrapperClassName,
  children,
  ...props
}: React.ComponentProps<'select'> & { wrapperClassName?: string }) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select
        data-slot="select"
        className={cn(
          'h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-transparent py-1 pr-9 pl-2.5 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 dark:[&>option]:bg-card',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { Select };
