'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  createRedeemCampaign,
  getRedeemCampaigns,
  getRedeemCodes,
  setRedeemCampaignActive,
  type RedeemCampaignRow,
} from '@/lib/admin-client';
import { planName } from '@/lib/plan-names';

const input =
  'w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground';

function downloadCodes(name: string, codes: string[]) {
  const blob = new Blob([codes.join('\n') + '\n'], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `redeem-${name.replace(/[^a-z0-9]+/gi, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Admin: create redeem-code campaigns (one shared word or a batch) and list them. */
export default function RedeemCampaigns() {
  const [rows, setRows] = useState<RedeemCampaignRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    plan: 'cloud' as 'cloud' | 'plus' | 'max',
    days: '14',
    perUserLimit: '1',
    totalLimit: '',
    expiresAt: '',
    mode: 'batch' as 'shared' | 'batch',
    code: '',
    count: '20',
    prefix: '',
  });
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const load = useCallback(async () => {
    try {
      setRows(await getRedeemCampaigns());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load campaigns');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      const codes = await createRedeemCampaign({
        name: form.name.trim(),
        plan: form.plan,
        days: Number(form.days),
        perUserLimit: Number(form.perUserLimit),
        totalLimit: form.totalLimit ? Number(form.totalLimit) : null,
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
        mode: form.mode,
        code: form.mode === 'shared' ? form.code : undefined,
        count: form.mode === 'batch' ? Number(form.count) : undefined,
        prefix: form.mode === 'batch' ? form.prefix : undefined,
      });
      toast.success(`Created ${codes.length} code${codes.length === 1 ? '' : 's'}`);
      if (form.mode === 'batch') downloadCodes(form.name, codes);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8" data-testid="admin-redeem">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Redeem codes
      </h2>
      <div className="grid gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-4">
        <label className="sm:col-span-2">
          Campaign name
          <input
            className={input}
            value={form.name}
            onChange={(e) => set('name')(e.target.value)}
          />
        </label>
        <label>
          Plan
          <select className={input} value={form.plan} onChange={(e) => set('plan')(e.target.value)}>
            <option value="cloud">Plus</option>
            <option value="plus">Pro</option>
            <option value="max">Max</option>
          </select>
        </label>
        <label>
          Days
          <input
            className={input}
            type="number"
            min={1}
            value={form.days}
            onChange={(e) => set('days')(e.target.value)}
          />
        </label>
        <label>
          Uses per person
          <input
            className={input}
            type="number"
            min={1}
            value={form.perUserLimit}
            onChange={(e) => set('perUserLimit')(e.target.value)}
          />
        </label>
        <label>
          {form.mode === 'shared' ? 'Total uses (required)' : 'Total uses (empty = no limit)'}
          <input
            className={input}
            type="number"
            min={1}
            value={form.totalLimit}
            onChange={(e) => set('totalLimit')(e.target.value)}
          />
        </label>
        <label>
          Last day to redeem (optional)
          <input
            className={input}
            type="date"
            value={form.expiresAt}
            onChange={(e) => set('expiresAt')(e.target.value)}
          />
        </label>
        <label>
          Codes
          <select className={input} value={form.mode} onChange={(e) => set('mode')(e.target.value)}>
            <option value="batch">Batch of single-use codes</option>
            <option value="shared">One shared code</option>
          </select>
        </label>
        {form.mode === 'shared' ? (
          <label className="sm:col-span-2">
            Shared code, 8–32 letters or digits (e.g. WELCOME2026)
            <input
              className={input}
              value={form.code}
              onChange={(e) => set('code')(e.target.value)}
            />
          </label>
        ) : (
          <>
            <label>
              How many
              <input
                className={input}
                type="number"
                min={1}
                max={1000}
                value={form.count}
                onChange={(e) => set('count')(e.target.value)}
              />
            </label>
            <label>
              Prefix (optional)
              <input
                className={input}
                value={form.prefix}
                onChange={(e) => set('prefix')(e.target.value)}
              />
            </label>
          </>
        )}
        <div className="flex items-end sm:col-span-2">
          <Button type="button" disabled={busy || !form.name.trim()} onClick={create}>
            {busy ? 'Creating…' : 'Create campaign'}
          </Button>
        </div>
      </div>

      {rows.length > 0 && (
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1">Campaign</th>
              <th>Plan</th>
              <th>Days</th>
              <th>Per person</th>
              <th>Used / codes</th>
              <th>Ends</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="py-1.5">{r.name}</td>
                <td>{planName(r.plan)}</td>
                <td>{r.days}</td>
                <td>{r.perUserLimit}</td>
                <td>
                  {r.uses} / {r.codes}
                  {r.totalLimit !== null && ` (max ${r.totalLimit})`}
                </td>
                <td>{r.expiresAt ? r.expiresAt.slice(0, 10) : '—'}</td>
                <td className="space-x-2 text-right whitespace-nowrap">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={async () =>
                      downloadCodes(
                        r.name,
                        (await getRedeemCodes(r.id)).map((c) => c.code),
                      )
                    }
                  >
                    Download
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await setRedeemCampaignActive(r.id, !r.active);
                      await load();
                    }}
                  >
                    {r.active ? 'Turn off' : 'Turn on'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
