export function Spinner({
  label = "Cargando",
  size = "md",
  tone = "brand",
}: {
  label?: string;
  size?: "sm" | "md";
  tone?: "brand" | "light";
}) {
  const small = size === "sm";
  return (
    <span
      className={`inline-flex items-center ${small ? "gap-2" : "gap-3"}`}
      role="status"
      aria-live="polite"
    >
      <span className={`relative block ${small ? "size-5" : "size-9"}`}>
        <span
          className={`absolute inset-0 rounded-full ${small ? "border-2" : "border-4"} ${tone === "light" ? "border-white/30" : "border-emerald-100"}`}
        />
        <span
          className={`absolute inset-0 animate-spin rounded-full border-transparent ${small ? "border-2" : "border-4"} ${tone === "light" ? "border-r-white/70 border-t-white" : "border-r-emerald-500 border-t-emerald-700"}`}
        />
        {!small && (
          <span className="absolute inset-[11px] rounded-full bg-emerald-700" />
        )}
      </span>
      <span
        className={`font-black ${tone === "light" ? "text-white" : "text-emerald-900"}`}
      >
        {label}
      </span>
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
