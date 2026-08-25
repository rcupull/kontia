import { useEffect, useState } from "react";
import { Building2, Check, Landmark, Percent } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { PageSpinner } from "../components/Spinner";
import type { Business } from "../types";

const currencies = [
  ["CUP", "Peso cubano (CUP)"],
  ["USD", "Dólar estadounidense (USD)"],
  ["EUR", "Euro (EUR)"],
  ["MXN", "Peso mexicano (MXN)"],
  ["DOP", "Peso dominicano (DOP)"],
  ["CAD", "Dólar canadiense (CAD)"],
] as const;

type FormState = Pick<Business, "name" | "currency" | "salesTaxPercentage">;

export function BusinessesPage() {
  const { user } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [enabledCurrencies, setEnabledCurrencies] = useState<string[]>([]);
  const canEdit = user?.role === "owner";

  useEffect(() => {
    void Promise.all([api.currentBusiness(), api.moneySettings()])
      .then(([{ business: current }, money]) => {
        setBusiness(current);
        setForm({
          name: current.name,
          currency: current.currency,
          salesTaxPercentage: current.salesTaxPercentage,
        });
        setEnabledCurrencies(
          money.currencies
            .filter((row) => row.isActive)
            .map((row) => row.currencyCode),
        );
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form || !canEdit) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await api.updateCurrentBusiness(form);
      await api.configureCurrencies(enabledCurrencies);
      const { business: current } = await api.currentBusiness();
      setBusiness(current);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageSpinner label="Cargando negocio…" />;
  if (!form)
    return (
      <p className="rounded-2xl bg-red-50 p-4 font-bold text-red-700">
        {error || "No se pudo cargar el negocio."}
      </p>
    );

  const fieldClass =
    "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <section className="mx-auto max-w-4xl">
      <p className="text-sm font-black uppercase tracking-wider text-emerald-700">
        Administración
      </p>
      <h1 className="mt-1 text-3xl font-black">Mi negocio</h1>
      <p className="mt-2 text-slate-500">
        Configura la información fiscal y la moneda usada en las operaciones.
      </p>

      <div className="mt-7 grid gap-5 md:grid-cols-[1fr_2fr]">
        <aside className="rounded-3xl bg-[#163f35] p-6 text-white shadow-sm">
          <span className="inline-grid rounded-2xl bg-white/10 p-3 text-emerald-300">
            <Building2 size={28} />
          </span>
          <h2 className="mt-5 text-xl font-black">{business?.name}</h2>
          <p className="mt-1 text-sm text-emerald-50/60">
            ID: {business?.id.slice(0, 8)}…
          </p>
          <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-sm">
            <p className="flex items-center gap-2">
              <Landmark size={17} className="text-emerald-300" />
              Moneda: <strong>{business?.currency}</strong>
            </p>
            <p className="flex items-center gap-2">
              <Percent size={17} className="text-emerald-300" />
              Impuesto: <strong>{business?.salesTaxPercentage}%</strong>
            </p>
          </div>
        </aside>

        <form
          onSubmit={save}
          className="rounded-3xl bg-white p-6 shadow-sm sm:p-8"
        >
          <h2 className="text-xl font-black">Configuración general</h2>
          <div className="mt-6 space-y-5">
            <label className="block text-sm font-black text-slate-700">
              Nombre del negocio
              <input
                required
                minLength={2}
                maxLength={80}
                disabled={!canEdit}
                className={fieldClass}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>
            <fieldset className="rounded-2xl border border-slate-200 p-4">
              <legend className="px-2 text-sm font-black text-slate-700">
                Monedas aceptadas
              </legend>
              <p className="mb-3 text-xs text-slate-400">
                La moneda base siempre permanece activa.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {currencies.map(([code, currencyLabel]) => {
                  const checked =
                    code === form.currency || enabledCurrencies.includes(code);
                  return (
                    <label
                      key={code}
                      className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold"
                    >
                      <input
                        type="checkbox"
                        disabled={!canEdit || code === form.currency}
                        checked={checked}
                        onChange={(event) =>
                          setEnabledCurrencies((current) =>
                            event.target.checked
                              ? [...new Set([...current, code])]
                              : current.filter((value) => value !== code),
                          )
                        }
                      />
                      {currencyLabel}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <label className="block text-sm font-black text-slate-700">
              Moneda
              <select
                disabled={!canEdit}
                className={fieldClass}
                value={form.currency}
                onChange={(event) =>
                  setForm({ ...form, currency: event.target.value })
                }
              >
                {!currencies.some(([code]) => code === form.currency) && (
                  <option value={form.currency}>{form.currency}</option>
                )}
                {currencies.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="mt-2 block font-normal text-slate-400">
                Se usará para mostrar precios, ventas y reportes.
              </span>
            </label>
            <label className="block text-sm font-black text-slate-700">
              Impuesto sobre ventas (%)
              <input
                required
                type="number"
                min="0"
                max="100"
                step="0.01"
                disabled={!canEdit}
                className={fieldClass}
                value={form.salesTaxPercentage}
                onChange={(event) =>
                  setForm({
                    ...form,
                    salesTaxPercentage: Number(event.target.value),
                  })
                }
              />
              <span className="mt-2 block font-normal text-slate-400">
                Acepta valores entre 0% y 100%.
              </span>
            </label>
          </div>

          {error && (
            <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">
              {error}
            </p>
          )}
          {saved && (
            <p className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
              <Check size={17} /> Configuración guardada correctamente.
            </p>
          )}
          {!canEdit && (
            <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">
              Solo el propietario puede modificar esta configuración.
            </p>
          )}
          {canEdit && (
            <div className="mt-7 flex justify-end">
              <button
                disabled={saving}
                className="rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          )}
        </form>
      </div>
    </section>
  );
}
