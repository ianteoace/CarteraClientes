import Link from "next/link";

export function Brand({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link aria-label="Billetera, ir a Mi cartera" className="inline-flex items-center gap-2.5 text-foreground" href={href}>
      <span aria-hidden="true" className="grid size-8 place-items-center rounded-[10px] bg-primary text-sm font-bold text-white">B</span>
      {!compact ? <span className="text-lg font-semibold tracking-[-0.035em]">Billetera</span> : null}
    </Link>
  );
}
