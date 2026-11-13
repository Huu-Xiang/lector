import { AudioLines, Captions, File, Link, Text, type LucideIcon } from 'lucide-react';
import type { ImportSource } from './types';

export const IMPORT_OPTIONS: Array<{
  source: ImportSource;
  icon: LucideIcon;
}> = [
  {
    source: 'file',
    icon: File,
  },
  {
    source: 'audio',
    icon: AudioLines,
  },
  {
    source: 'url',
    icon: Link,
  },
  {
    source: 'youtube',
    icon: Captions,
  },
  {
    source: 'paste',
    icon: Text,
  },
];
