import { useTranslations } from 'next-intl';
import TargetText from '@/components/TargetText';

/** Link-styled word inside an entry — clicking re-targets the drawer (issue #106). */
export default function NestedWordButton({
  word,
  onLookupWord,
  testId,
}: {
  word: string;
  onLookupWord: (word: string) => void;
  testId: string;
}) {
  const t = useTranslations('reader.drawer');
  return (
    <button
      type="button"
      onClick={() => onLookupWord(word)}
      data-testid={testId}
      className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      title={t('lookUp', { word })}
    >
      <TargetText>{word}</TargetText>
    </button>
  );
}
