'use client';

import { useFormatter, useTranslations } from 'next-intl';
import AnkiStatus from '@/components/AnkiStatus';
import StateIndicator from '@/components/StateIndicator';
import { VocabRowProps } from './types';

export default function VocabRow({
  entry,
  bookTitle,
  isSelected,
  onSelect,
  onClick,
}: VocabRowProps) {
  const t = useTranslations('vocab.list');
  const format = useFormatter();
  const formattedDate = format.dateTime(new Date(entry.createdAt), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <tr
      className="cursor-pointer border-b border-border transition-colors hover:bg-accent"
      onClick={() => onClick(entry)}
    >
      {/* Checkbox */}
      <td className="w-10 px-2 py-3 sm:w-12 sm:px-4">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(entry.id, e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
        />
      </td>

      {/* Word/Phrase */}
      <td className="px-2 py-3 sm:px-4">
        <div className="flex flex-col">
          <span className="font-medium break-keep text-foreground">{entry.text}</span>
          {entry.type === 'phrase' && (
            <span className="text-xs text-muted-foreground">{t('phrase')}</span>
          )}
        </div>
      </td>

      {/* Translation */}
      <td className="max-w-xs min-w-32 px-2 py-3 sm:px-4">
        <span className="line-clamp-2 text-muted-foreground">{entry.translation}</span>
      </td>

      {/* State */}
      <td className="px-2 py-3 sm:px-4">
        <div className="flex items-center justify-center">
          <StateIndicator state={entry.state} />
        </div>
      </td>

      <td className="max-w-[150px] min-w-20 px-2 py-3 sm:px-4">
        <span className="line-clamp-2 text-sm text-muted-foreground sm:line-clamp-1">
          {bookTitle || '-'}
        </span>
      </td>
      <td className="hidden px-4 py-3 text-sm whitespace-nowrap text-muted-foreground sm:table-cell">
        {formattedDate}
      </td>
      <td className="hidden px-4 py-3 sm:table-cell">
        <AnkiStatus pushedToAnki={entry.pushedToAnki} ankiNoteId={entry.ankiNoteId} />
      </td>
    </tr>
  );
}
