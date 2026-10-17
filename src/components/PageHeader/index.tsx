import { IPageHeaderProps } from './types';

export default function PageHeader({ children, title }: IPageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-extrabold text-foreground">{title}</h1>
      {children}
    </div>
  );
}
