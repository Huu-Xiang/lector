import { IPageHeaderProps } from './types';

export default function PageHeader({
  children,
  title,
  titleAside,
  className = 'mb-6',
}: IPageHeaderProps) {
  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      {titleAside ? (
        <div className="flex items-center justify-between gap-3 sm:justify-start">
          <h1 className="text-2xl font-extrabold text-foreground">{title}</h1>
          {titleAside}
        </div>
      ) : (
        <h1 className="text-2xl font-extrabold text-foreground">{title}</h1>
      )}
      {children}
    </div>
  );
}
