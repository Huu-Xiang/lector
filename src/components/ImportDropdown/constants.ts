import React from 'react';
import { AudioLines, Captions, File, Link, Text } from 'lucide-react';
import type { ImportSource } from './types';

export const IMPORT_OPTIONS: Array<{
  source: ImportSource;
  icon: React.FC<{ size?: string | number }>;
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
