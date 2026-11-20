'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { decideRefundRequest, getRefundRequests, type RefundRequestRow } from '@/lib/admin-client';
import { planName } from '@/lib/plan-names';

/** Admin: RMB refund requests. Refund in the Xiaodou portal first, then approve here. */
export default function RefundRequests() {
  const [rows, setRows] = useState<RefundRequestRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await getRefundRequests());
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = rows.filter((row) => row.status === 'PENDING');
  if (pending.length === 0) return null;

  async function decide(row: RefundRequestRow, approve: boolean) {
    if (
      approve &&
      !window.confirm(
        `Approve the refund for ${row.email ?? row.userId}? Refund order ${row.outTradeNo} in the Xiaodou portal first. Approving ends the plan.`,
      )
    ) {
      return;
    }
    setBusyId(row.id);
    try {
      await decideRefundRequest(row.id, approve);
      toast.success(approve ? 'Refund approved, plan ended' : 'Request rejected');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Decision failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section
      className="mb-8 rounded-xl border border-border bg-card p-4"
      data-testid="refund-requests"
    >
      <h2 className="mb-3 text-lg font-semibold">Refund requests ({pending.length})</h2>
      <ul className="divide-y divide-border">
        {pending.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{row.email ?? row.userId}</div>
              <div className="text-xs text-muted-foreground">
                {planName(row.plan)} · ¥{(row.amountFen / 100).toFixed(2)} · {row.channel} · used{' '}
                {row.usedPercent}% · order {row.outTradeNo} · {row.createdAt.slice(0, 16)}
              </div>
            </div>
            <Button size="sm" disabled={busyId === row.id} onClick={() => decide(row, true)}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busyId === row.id}
              onClick={() => decide(row, false)}
            >
              Reject
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
