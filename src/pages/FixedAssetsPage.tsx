import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { ArchiveRestore, Refrigerator, X } from "lucide-react";
import { api } from "../api";
import type {
  FixedAsset,
  Investor,
  ReclassifiableContribution,
} from "../types";
import { FieldInput, FieldSelect, FieldTextarea } from "../components/fields";
import { PageSpinner } from "../components/Spinner";

type Values = {
  componentId: string;
  investorId: string;
  name: string;
  category: string;
  value: number;
  acquisitionDate: string;
  description: string;
};
export function FixedAssetsPage() {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [sources, setSources] = useState<ReclassifiableContribution[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [baseCurrency, setBaseCurrency] = useState("CUP");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const form = useForm<Values>();
  const load = async () => {
    const [assetData, sourceData, investments] = await Promise.all([
      api.fixedAssets(),
      api.reclassifiableContributions(),
      api.investments(),
    ]);
    setAssets(assetData.assets);
    setSources(sourceData.contributions);
    setBaseCurrency(investments.baseCurrency);
    setInvestors(investments.investors);
  };
  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, []);
  const selected = sources.find(
    (row) => row.componentId === form.watch("componentId"),
  );
  useEffect(() => {
    if (selected?.investorId) form.setValue("investorId", selected.investorId);
  }, [form, selected?.investorId]);
  const money = (cents: number) =>
    new Intl.NumberFormat("es", {
      style: "currency",
      currency: baseCurrency,
    }).format(cents / 100);
  function showForm() {
    const source = sources[0];
    setError("");
    form.reset({
      componentId: source?.componentId ?? "",
      investorId: source?.investorId ?? "",
      name: "",
      category: "Equipamiento",
      value: (source?.baseAmountCents ?? 0) / 100,
      acquisitionDate: new Date().toISOString().slice(0, 10),
      description: "",
    });
    setOpen(true);
  }
  async function submit(values: Values) {
    const source = sources.find(
      (row) => row.componentId === values.componentId,
    );
    if (!source) return setError("Selecciona el aporte que contiene el activo");
    try {
      await api.reclassifyContributionAsFixedAsset({
        investmentEntryId: source.entryId,
        financialMovementId: source.financialMovementId,
        investorId: source.investorId ?? values.investorId,
        monetaryComponentId: source.componentId,
        name: values.name,
        category: values.category,
        description: values.description || undefined,
        acquisitionDate: values.acquisitionDate,
        valueCents: Math.round(values.value * 100),
      });
      setOpen(false);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "No se pudo reclasificar",
      );
    }
  }
  if (loading) return <PageSpinner label="Cargando activos fijos…" />;
  return (
    <section>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-emerald-700">
            Patrimonio
          </p>
          <h1 className="mt-1 text-3xl font-black">Activos fijos</h1>
          <p className="mt-2 text-slate-500">
            Equipos y bienes duraderos que no representan dinero disponible.
          </p>
        </div>
        <button
          onClick={showForm}
          disabled={!sources.length}
          className="flex items-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 font-black text-white disabled:opacity-40"
        >
          <ArchiveRestore size={18} />
          Reclasificar aporte
        </button>
      </div>
      {!sources.length && (
        <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          No hay componentes monetarios de aportes disponibles para
          reclasificar.
        </p>
      )}
      <div className="mt-6 overflow-x-auto rounded-3xl bg-white shadow-sm">
        <table className="w-full min-w-[700px] text-left">
          <thead className="text-xs uppercase text-slate-400">
            <tr>
              <th className="px-5 py-4">Activo</th>
              <th>Inversor aportante</th>
              <th>Fecha</th>
              <th>Valor original</th>
              <th>Valor neto</th>
              <th>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id} className="border-t">
                <td className="px-5 py-4">
                  <p className="font-black">{asset.name}</p>
                  <p className="text-xs text-slate-500">{asset.category}</p>
                </td>
                <td>{asset.investorName || "Negocio"}</td>
                <td>
                  {new Date(
                    `${asset.acquisitionDate}T00:00:00`,
                  ).toLocaleDateString("es")}
                </td>
                <td>{money(asset.originalValueCents)}</td>
                <td className="font-black">
                  {money(
                    asset.originalValueCents -
                      asset.accumulatedDepreciationCents,
                  )}
                </td>
                <td>
                  {asset.acquisitionType === "inKindContribution"
                    ? "Aporte en especie"
                    : "Compra"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!assets.length && (
          <div className="grid place-items-center p-12 text-slate-400">
            <Refrigerator size={40} />
            <p className="mt-3 font-bold">No hay activos fijos registrados.</p>
          </div>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/45 p-4">
          <FormProvider {...form}>
            <form
              onSubmit={form.handleSubmit(submit)}
              className="mx-auto my-10 max-w-xl rounded-3xl bg-white p-7"
            >
              <div className="flex justify-between">
                <div>
                  <h2 className="text-2xl font-black">
                    Reclasificar como activo fijo
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    No cambia unidades ni porcentajes.
                  </p>
                </div>
                <button type="button" onClick={() => setOpen(false)}>
                  <X />
                </button>
              </div>
              <div className="mt-6 grid gap-4">
                <FieldSelect
                  label="Aporte y cuenta de origen"
                  options={sources.map((row) => ({
                    value: row.componentId,
                    label: `${row.investorName ?? "Movimiento histórico"} · ${(row.amountMinor / 100).toLocaleString("es")} ${row.currencyCode} · ${row.accountName}`,
                  }))}
                  register={form.register("componentId", { required: true })}
                />
                {selected && (
                  <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
                    Disponible para reclasificar:{" "}
                    <b>{money(selected.baseAmountCents)}</b>. Esta cantidad
                    dejará de aparecer como dinero.
                  </p>
                )}
                <FieldSelect
                  label="Inversor aportante"
                  options={investors.map((row) => ({
                    value: row.id,
                    label: row.name,
                  }))}
                  disabled={Boolean(selected?.investorId)}
                  register={form.register("investorId", {
                    required: "Selecciona el inversor",
                  })}
                />
                <FieldInput
                  label="Nombre del activo"
                  placeholder="Nevera expositora"
                  register={form.register("name", {
                    required: "Indica el activo",
                  })}
                  error={form.formState.errors.name}
                />
                <FieldInput
                  label="Categoría"
                  register={form.register("category", { required: true })}
                />
                <FieldInput
                  label={`Valor (${baseCurrency})`}
                  type="number"
                  min="0.01"
                  max={(selected?.baseAmountCents ?? 0) / 100}
                  register={form.register("value", {
                    valueAsNumber: true,
                    required: true,
                  })}
                />
                <FieldInput
                  label="Fecha de adquisición"
                  type="date"
                  register={form.register("acquisitionDate", {
                    required: true,
                  })}
                />
                <FieldTextarea
                  label="Descripción"
                  register={form.register("description")}
                />
              </div>
              {error && <p className="mt-4 font-bold text-red-600">{error}</p>}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="font-black text-slate-500"
                >
                  Cancelar
                </button>
                <button className="rounded-xl bg-emerald-700 px-5 py-2.5 font-black text-white">
                  Reclasificar
                </button>
              </div>
            </form>
          </FormProvider>
        </div>
      )}
    </section>
  );
}
