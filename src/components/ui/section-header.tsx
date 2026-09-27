import type { ReactNode } from "react";

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="flex items-center gap-4"><h2 className="section-heading flex-1">{title}</h2>{action}</div>;
}
