import { Clipboard, Pencil, List, Library, ChartBar, Settings } from 'lucide-react';

export const navLinks = [
  { href: '/', labelKey: 'library' },
  { href: '/practice', labelKey: 'practice' },
  { href: '/journal', labelKey: 'journal' },
  { href: '/vocab', labelKey: 'vocab' },
  { href: '/stats', labelKey: 'stats' },
  { href: '/settings', labelKey: 'settings' },
] as const;

export const iconMap: Record<string, React.FC<{ size?: number | string }>> = {
  '/': Library,
  '/practice': Clipboard,
  '/journal': Pencil,
  '/vocab': List,
  '/stats': ChartBar,
  '/settings': Settings,
};
