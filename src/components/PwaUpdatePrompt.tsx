import { Download, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-update-title"
    >
      <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <span className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
            <Download size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="pwa-update-title" className="text-xl font-black">
              Nueva versión disponible
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Kontia descargó una actualización. Actualiza ahora para usar la
              versión más reciente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Actualizar más tarde"
          >
            <X size={19} />
          </button>
        </div>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="rounded-2xl border border-slate-200 px-4 py-3 font-black text-slate-600 hover:bg-slate-50"
          >
            Más tarde
          </button>
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="rounded-2xl bg-emerald-700 px-4 py-3 font-black text-white hover:bg-emerald-800"
          >
            Actualizar ahora
          </button>
        </div>
      </section>
    </div>
  );
}
