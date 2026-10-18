import type { ReactNode } from 'react';

export const Title = ({
  title,
  text,
  children,
}: {
  title: string;
  text?: string;
  children?: ReactNode;
}) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="font-heading text-2xl font-semibold text-ink">{title}</h1>
      {text && <p className="mt-1 max-w-2xl text-sm text-ink-soft">{text}</p>}
    </div>
    {children}
  </div>
);
