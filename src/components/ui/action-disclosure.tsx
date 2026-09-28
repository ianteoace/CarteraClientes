import type { ReactNode } from "react";

/** Native disclosure keeps small actions inline, keyboard-accessible and dependency-free. */
export function ActionDisclosure({ title, children }: { title: string; children: ReactNode }) {
  return <details className="action-disclosure"><summary>{title}<span aria-hidden="true">＋</span></summary><div className="action-disclosure-body">{children}</div></details>;
}
