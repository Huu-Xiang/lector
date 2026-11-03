'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getEmailSwitch, setEmailSwitch, type EmailSwitch as Switch } from '@/lib/admin-client';

/** One switch for every lifecycle mail; sign-in and password mail are not affected. */
export default function EmailSwitch() {
  const [state, setState] = useState<Switch | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getEmailSwitch()
      .then(setState)
      .catch(() => setState(null));
  }, []);

  if (!state) return null;

  async function flip() {
    if (!state) return;
    const next = !state.enabled;
    const question = next
      ? 'Turn product emails ON? Welcome, reminder and limit emails start sending to verified accounts.'
      : 'Turn product emails OFF? No welcome, reminder or limit email is sent until you turn them on.';
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      setState(await setEmailSwitch(next));
      toast.success(next ? 'Product emails on' : 'Product emails off');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the switch');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mb-8 rounded-xl border border-border bg-card p-4"
      data-testid="email-switch"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Product emails:{' '}
            <span className={state.enabled ? 'text-primary' : 'text-muted-foreground'}>
              {state.enabled ? 'on' : 'off'}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Welcome, day-1 and day-3 reminders, the 10-word note and the free-limit note. Sign-in,
            verification and password mail always send.
            {state.source === 'env' ? ' Set by LIFECYCLE_EMAILS until you change it here.' : ''}
          </p>
        </div>
        <Button
          size="sm"
          variant={state.enabled ? 'outline' : 'default'}
          onClick={flip}
          disabled={busy}
          data-testid="email-switch-toggle"
        >
          {state.enabled ? 'Turn off' : 'Turn on'}
        </Button>
      </div>
    </section>
  );
}
