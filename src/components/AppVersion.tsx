import { useEffect, useState } from "react";
import { api, isConnectionError } from "../api";

type VersionState = "checking" | "current" | "outdated" | "offline";

export function AppVersion({ dark = false }: { dark?: boolean }) {
  const [state, setState] = useState<VersionState>("checking");

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const result = await api.health();
        if (active)
          setState(result.version === __APP_VERSION__ ? "current" : "outdated");
      } catch (reason) {
        if (active)
          setState(isConnectionError(reason) ? "offline" : "checking");
      }
    }
    const handleOnline = () => void check();
    void check();
    window.addEventListener("online", handleOnline);
    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const status = {
    checking: "Comprobando…",
    current: "Actualizada",
    outdated: "Actualización disponible",
    offline: "Sin conexión",
  }[state];

  return (
    <span
      title={`Kontia ${__APP_VERSION__} · ${status}`}
      className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${
        state === "outdated"
          ? "text-amber-500"
          : dark
            ? "text-emerald-100/60"
            : "text-slate-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          state === "current"
            ? "bg-emerald-500"
            : state === "outdated"
              ? "bg-amber-500"
              : "bg-slate-400"
        }`}
      />
      v{__APP_VERSION__} · {status}
    </span>
  );
}
