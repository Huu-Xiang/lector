import { useEffect, useState } from 'react';
import { SETTINGS_KEYS } from '@/app/settings/constants';
import { isComposing } from '@/lib/keyboard';

export function useShowTranslation(): [boolean, () => void] {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(SETTINGS_KEYS.HIDE_TRANSLATION) !== 'true';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isComposing(event)) return;
      if (event.altKey && event.code === 'KeyT') {
        event.preventDefault();
        setShow((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return [show, () => setShow(true)];
}
