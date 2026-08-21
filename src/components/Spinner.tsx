export function Spinner({ label = "Cargando" }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-3"
      role="status"
      aria-live="polite"
    >
      <span className="relative block size-9">
        <span className="absolute inset-0 rounded-full border-4 border-emerald-100" />
        <span className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-emerald-700 border-r-emerald-500" />
        <span className="absolute inset-[11px] rounded-full bg-emerald-700" />
      </span>
      <span className="font-black text-emerald-900">{label}</span>
    </span>
  );
}

export function PageSpinner({ label = "Cargando datos…" }: { label?: string }) {
  return (
    <div className="grid min-h-[45vh] place-items-center rounded-3xl bg-white/65 shadow-sm">
      <div className="flex flex-col items-center gap-3">
        <Spinner label={label} />
        <p className="text-sm font-semibold text-slate-400">
          Estamos preparando la información.
        </p>
      </div>
    </div>
  );
}
