import { Button } from '@/components/ui/button';
import { getAllKnownWords, getAllVocab } from '@/lib/data-layer';
import { downloadFile } from '@/utils/browser';
import { useActiveLanguage } from '@/utils/hooks';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export default function Export() {
  const t = useTranslations('settings.export');
  const activeLang = useActiveLanguage();
  // ASCII slug for filenames, e.g. "afrikaans" / "german" / "spanish".
  const slug = activeLang.name.toLowerCase();

  const notifyError = (error: Error | unknown) => {
    toast.error(
      t('failed', { message: error instanceof Error ? error.message : t('unknownError') }),
    );
  };

  const exportVocabCSV = async () => {
    try {
      const vocab = await getAllVocab();
      const csv = [
        'text,type,sentence,translation,state,createdAt',
        ...vocab.map(
          (v) =>
            `"${v.text}","${v.type}","${v.sentence.replace(/"/g, '""')}","${v.translation.replace(/"/g, '""')}","${v.state}","${v.createdAt.toISOString()}"`,
        ),
      ].join('\n');

      downloadFile(csv, `${slug}-vocab.csv`, 'text/csv');
      toast.success(t('csvDone'));
    } catch (error) {
      notifyError(error);
    }
  };

  const exportVocabJSON = async () => {
    try {
      const vocab = await getAllVocab();
      const json = JSON.stringify(vocab, null, 2);
      downloadFile(json, `${slug}-vocab.json`, 'application/json');
      toast.success(t('jsonDone'));
    } catch (error) {
      notifyError(error);
    }
  };

  const exportKnownWords = async () => {
    try {
      const knownWords = await getAllKnownWords();
      const words = knownWords.filter((w) => w.state === 'known').map((w) => w.word);
      const text = words.join('\n');
      downloadFile(text, `${slug}-known-words.txt`, 'text/plain');
      toast.success(t('knownDone', { count: words.length }));
    } catch (error) {
      notifyError(error);
    }
  };

  return (
    <section className="panel p-6">
      <h2 className="mb-4 text-lg font-semibold text-foreground">{t('title')}</h2>
      <div className="flex flex-wrap gap-3">
        <Button onClick={exportVocabCSV}>{t('vocabCsv')}</Button>
        <Button onClick={exportVocabJSON}>{t('vocabJson')}</Button>
        <Button onClick={exportKnownWords}>{t('knownWords')}</Button>
      </div>
    </section>
  );
}
