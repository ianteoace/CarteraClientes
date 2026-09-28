/** Presentation only: labels and permitted transitions remain owned by each module. */
const SUCCESS = new Set(["RESOLVED", "CLOSED", "COMPLETED", "PAID", "ACCEPTED", "DELIVERED", "READ"]);
const WARNING = new Set(["WAITING", "MONITORING", "SCHEDULED", "PARTIAL", "HIGH", "PENDING", "PARTIALLY_PAID"]);
const DANGER = new Set(["FAILED", "URGENT", "CANCELLED"]);

export function StatusBadge({ status, children }: { status: string; children: React.ReactNode }) {
  const tone = SUCCESS.has(status) ? "success" : WARNING.has(status) ? "warning" : DANGER.has(status) ? "danger" : "neutral";
  return <span className={`badge-${tone}`}>{children}</span>;
}
