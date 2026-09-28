export function ModuleSkeleton() {
  return <div className="app-page" role="status" aria-label="Cargando módulo">
    <span className="sr-only">Cargando…</span><div className="skeleton-line h-3 w-20" /><div className="skeleton-line mt-3 h-8 w-52" /><div className="skeleton-line mt-6 h-9 w-full" />
    <div className="mt-5 divide-y divide-border border-y border-border">{[0, 1, 2, 3, 4].map((row) => <div className="flex gap-5 py-4" key={row}><div className="skeleton-line h-4 w-12" /><div className="skeleton-line h-4 w-1/2" /><div className="skeleton-line ml-auto h-4 w-20" /></div>)}</div>
  </div>;
}
