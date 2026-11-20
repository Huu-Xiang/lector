import { Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { getActivePack } from '@/lib/data-layer';
import { canSpeak, speak } from '@/lib/tts';

export default function WordHeader({ word }: { word: string }) {
  const t = useTranslations('practice.words');
  const pack = getActivePack();
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <bdi dir={pack.script.direction} lang={pack.script.bcp47} className="text-3xl font-semibold">
        {word}
      </bdi>
      {canSpeak() && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('listen')}
          onClick={() => void speak(word)}
        >
          <Volume2 />
        </Button>
      )}
    </div>
  );
}
