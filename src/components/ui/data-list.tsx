import type { CSSProperties, ReactNode } from "react";

/** The same connected-list pattern as Contactos; columns collapse into adaptive rows. */
export function DataList({ columns, headers, children, label }: { columns: string; headers: string[]; children: ReactNode; label: string }) {
  const style = columns === "team" ? { "--data-columns": `minmax(0,1.3fr) 75px minmax(0,1fr) ${headers.length > 3 ? `repeat(${headers.length - 3},65px)` : ""}` } as CSSProperties : undefined;
  return <div className={`data-list data-list-${columns}`} aria-label={label} style={style}>
    <div className="data-list-heading" aria-hidden="true">{headers.map((header) => <span key={header}>{header}</span>)}</div>
    {children}
  </div>;
}
