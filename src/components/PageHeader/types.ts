import { ReactNode } from 'react';

export interface IPageHeaderProps {
  title: ReactNode;
  children?: ReactNode;
  /** Shown on the title's line, at its end on phones. */
  titleAside?: ReactNode;
}
