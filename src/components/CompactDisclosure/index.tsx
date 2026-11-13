'use client';

import { useState, type ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';

export default function CompactDisclosure({
  name,
  title,
  icon: Icon,
  anchors,
  defer = false,
  children,
}: {
  name: string;
  title: string;
  icon?: LucideIcon;
  anchors?: string;
  defer?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <details
      name={name}
      className="group scroll-mt-20"
      data-disclosure-anchors={anchors}
      onToggle={({ currentTarget: detail }) => {
        if (detail.open && !Reflect.has(detail, 'name')) {
          for (const sibling of detail.parentElement?.querySelectorAll<HTMLDetailsElement>(
            ':scope > details[open]',
          ) ?? []) {
            if (sibling !== detail && sibling.getAttribute('name') === name) sibling.open = false;
          }
        }
        if (defer) setOpen(detail.open);
      }}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring active:bg-accent [&::-webkit-details-marker]:hidden">
        {Icon && <Icon className="size-4 shrink-0 text-primary" aria-hidden />}
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground group-open:rotate-90"
          aria-hidden
        />
      </summary>
      {(!defer || open) && (
        <div className="compact-disclosure-body border-t border-border">{children}</div>
      )}
    </details>
  );
}
