import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, metadata, actions, secondaryActions }: { eyebrow?: string; title: string; description?: string; metadata?: ReactNode; actions?: ReactNode; secondaryActions?: ReactNode }) {
  return <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5"><div className="min-w-0">{eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}<h1 className="page-heading">{title}</h1>{description ? <p className="page-description">{description}</p> : null}{metadata ? <div className="mt-2 text-xs text-muted">{metadata}</div> : null}</div>{actions || secondaryActions ? <div className="flex flex-wrap items-center gap-2">{secondaryActions}{actions}</div> : null}</header>;
}
