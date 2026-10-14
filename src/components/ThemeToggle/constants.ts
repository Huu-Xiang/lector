import { Monitor, Sun, Moon } from 'lucide-react';
import { IThemeOption } from './types';

export const OPTIONS: IThemeOption[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
];
