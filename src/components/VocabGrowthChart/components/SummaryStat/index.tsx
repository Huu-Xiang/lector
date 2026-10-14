'use client';

import { useFormatter } from 'next-intl';

export default function SummaryStat({
  value,
  label,
  colorClassName,
}: {
  value: number;
  label: string;
  colorClassName: string;
}) {
  const format = useFormatter();
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${colorClassName}`}>{format.number(value)}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
