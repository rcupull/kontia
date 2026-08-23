function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "U"}${parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : ""}`.toUpperCase();
}

export function UserMenuHeader({ displayName }: { displayName?: string }) {
  const name = displayName?.trim() || "Usuario";

  return (
    <div className="flex items-center gap-3 px-2 py-2">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-black text-emerald-800 ring-1 ring-emerald-200">
        {initials(name)}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-400">Sesión iniciada</p>
        <p className="truncate text-sm font-black text-slate-800">{name}</p>
      </div>
    </div>
  );
}
