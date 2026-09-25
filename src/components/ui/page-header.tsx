import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-4"><div>{eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}<h1 className="page-heading">{title}</h1>{description ? <p className="page-description">{description}</p> : null}</div>{actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}</div>;
}
