import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { CircleDollarSign, Minus, Plus, UserPlus, X } from "lucide-react";
import { api } from "../api";
import type { InvestmentSummary, MoneySettings } from "../types";
import { PageSpinner } from "../components/Spinner";
import {
  FieldDateTimePicker,
  FieldInput,
  FieldSelect,
  FieldTextarea,
} from "../components/fields";
import {
  MonetaryComponentsEditor,
  draftToComponent,
  newPaymentDraft,
  type PaymentDraft,
} from "../components/MonetaryComponentsEditor";

type Modal = "investor" | "contribution" | "distribution" | "withdrawal" | null;
type Values = {
  name: string;
  investorId: string;
  amount: number;
  valuation: number;
  entryDate: string;
  notes: string;
  affectsCash: string;
};

export function InvestmentsPage() {
  const [data, setData] = useState<InvestmentSummary | null>(null);
  const [settings, setSettings] = useState<MoneySettings | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [drafts, setDrafts] = useState<PaymentDraft[]>([]);
  const [error, setError] = useState("");
  const form = useForm<Values>();
  const load = async () => {
    const [summary, money] = await Promise.all([
      api.investments(),
      api.moneySettings(),
    ]);
    setData(summary);
    setSettings(money);
  };
  useEffect(() => {
    void load().catch((reason: Error) => setError(reason.message));
  }, []);
  if (!data || !settings) return <PageSpinner label="Cargando inversiones…" />;
  const summary = data;
  const moneySettings = settings;
  const format = (cents: number) =>
    new Intl.NumberFormat("es", {
      style: "currency",
      currency: summary.baseCurrency,
    }).format(cents / 100);
  const open = (next: Modal) => {
    setError("");
    setModal(next);
    form.reset({
      name: "",
      investorId: summary.investors.find((row) => row.isActive)?.id ?? "",
      amount:
        next === "contribution" && !summary.totalUnitsMicros
          ? summary.currentValuation.totalCents / 100
          : 0,
      valuation:
        next === "contribution" && summary.totalUnitsMicros
          ? summary.currentValuation.totalCents / 100
          : 0,
      entryDate: new Date().toISOString(),
      notes: "",
      affectsCash: summary.totalUnitsMicros ? "yes" : "no",
    });
    setDrafts([newPaymentDraft(moneySettings.baseCurrency)]);
  };
  async function submit(values: Values) {
    try {
      if (modal === "investor")
        await api.createInvestor({
          name: values.name,
          notes: values.notes || undefined,
        });
      if (modal === "contribution") {
        const affectsCash = values.affectsCash === "yes";
        await api.createInvestmentContribution({
          investorId: values.investorId,
          amountCents: Math.round(values.amount * 100),
          preMoneyValuationCents: summary.totalUnitsMicros
            ? Math.round(values.valuation * 100)
            : undefined,
          entryDate: values.entryDate,
          notes: values.notes || undefined,
          affectsCash,
          components: affectsCash
            ? drafts
                .map((row) => draftToComponent(row, moneySettings))
                .filter((row): row is NonNullable<typeof row> => Boolean(row))
            : undefined,
        });
      }
      if (modal === "distribution")
        await api.createInvestmentDistribution({
          amountCents: Math.round(values.amount * 100),
          entryDate: values.entryDate,
          notes: values.notes || undefined,
          components: drafts
            .map((row) => draftToComponent(row, moneySettings))
            .filter((row): row is NonNullable<typeof row> => Boolean(row)),
        });
      if (modal === "withdrawal")
        await api.createInvestmentWithdrawal({
          investorId: values.investorId,
          amountCents: Math.round(values.amount * 100),
          entryDate: values.entryDate,
          notes: values.notes || undefined,
          components: drafts
            .map((row) => draftToComponent(row, moneySettings))
            .filter((row): row is NonNullable<typeof row> => Boolean(row)),
        });
      setModal(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar");
    }
  }
  const amountCents = Math.round(Number(form.watch("amount") || 0) * 100);
  const valuationCents = Math.round(Number(form.watch("valuation") || 0) * 100);
  const projected =
    amountCents > 0 && valuationCents > 0
      ? amountCents / (valuationCents + amountCents)
      : 0;
  return (
    <section>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-emerald-700">
            Capital
          </p>
          <h1 className="mt-1 text-3xl font-black">
            Inversores y participaciones
          </h1>
          <p className="mt-2 text-slate-500">
            Aportes, propiedad y distribuciones del fondo común.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => open("investor")}
            className="flex items-center gap-2 rounded-2xl border border-emerald-700 px-4 py-3 font-black text-emerald-800"
          >
            <UserPlus size={18} />
            Inversor
          </button>
          <button
            onClick={() => open("contribution")}
            disabled={!data.investors.some((row) => row.isActive)}
            className="flex items-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 font-black text-white disabled:opacity-40"
          >
            <Plus size={18} />
            Aporte
          </button>
          <button
            onClick={() => open("distribution")}
            disabled={!data.totalUnitsMicros}
            className="flex items-center gap-2 rounded-2xl bg-slate-800 px-4 py-3 font-black text-white disabled:opacity-40"
          >
            <CircleDollarSign size={18} />
            Distribuir
          </button>
          <button
            onClick={() => open("withdrawal")}
            disabled={!data.totalUnitsMicros}
            className="flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-3 font-black text-red-700 disabled:opacity-40"
          >
            <Minus size={18} />
            Retirar capital
          </button>
        </div>
      </div>
      {error && !modal && (
        <p className="mt-4 rounded-xl bg-red-50 p-3 font-bold text-red-700">
          {error}
        </p>
      )}
      {!data.totalUnitsMicros && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <b>
            Capital actual calculado: {format(data.currentValuation.totalCents)}
            .
          </b>{" "}
          Tesorería: {format(data.currentValuation.treasuryCents)} · Inventario
          al costo: {format(data.currentValuation.inventoryCents)}. Crea
          “Fundadores” y abre un aporte; Kontia colocará este total
          automáticamente como capital que ya estaba dentro.
        </div>
      )}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.investors.map((investor) => (
          <article
            key={investor.id}
            className="rounded-3xl bg-white p-5 shadow-sm"
          >
            <div className="flex justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-slate-400">
                  Inversor
                </p>
                <h2 className="text-xl font-black">{investor.name}</h2>
              </div>
              <span className="text-3xl font-black text-emerald-700">
                {(investor.ownershipBps / 100).toLocaleString("es", {
                  maximumFractionDigits: 2,
                })}
                %
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-slate-400">Capital neto</p>
                <b>{format(investor.netContributedCents)}</b>
              </div>
              <div>
                <p className="text-slate-400">Patrimonio actual</p>
                <b>{format(investor.currentPatrimonyCents)}</b>
              </div>
              <div>
                <p className="text-slate-400">Capital retirado</p>
                <b>{format(investor.withdrawnCapitalCents)}</b>
              </div>
              <div>
                <p className="text-slate-400">Ganancias distribuidas</p>
                <b>{format(investor.distributedCents)}</b>
              </div>
            </div>
            {investor.notes && (
              <p className="mt-3 text-sm text-slate-500">{investor.notes}</p>
            )}
          </article>
        ))}
      </div>
      <div className="mt-6 overflow-x-auto rounded-3xl bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left">
          <thead className="text-xs uppercase text-slate-400">
            <tr>
              <th className="px-5 py-4">Fecha</th>
              <th>Inversor</th>
              <th>Operación</th>
              <th>Importe</th>
              <th>Cuota actual</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((entry) => (
              <tr key={entry.id} className="border-t">
                <td className="px-5 py-4">
                  {new Date(entry.entryDate).toLocaleString("es")}
                </td>
                <td className="font-bold">{entry.investorName}</td>
                <td>
                  {entry.entryType === "openingCapital"
                    ? "Capital inicial"
                    : entry.entryType === "contribution"
                      ? "Aporte"
                      : entry.entryType === "capitalWithdrawal"
                        ? "Retiro de capital"
                        : "Distribución"}
                </td>
                <td
                  className={
                    ["profitDistribution", "capitalWithdrawal"].includes(
                      entry.entryType,
                    )
                      ? "font-black text-red-600"
                      : "font-black text-emerald-700"
                  }
                >
                  {["profitDistribution", "capitalWithdrawal"].includes(
                    entry.entryType,
                  )
                    ? "−"
                    : "+"}
                  {format(entry.amountCents)}
                </td>
                <td>
                  {entry.unitsMicros
                    ? `${((entry.unitsMicros / data.totalUnitsMicros) * 100).toLocaleString("es", { maximumFractionDigits: 2 })}%`
                    : "—"}
                </td>
                <td>{entry.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.entries.length && (
          <p className="p-10 text-center font-bold text-slate-400">
            Todavía no hay movimientos de inversión.
          </p>
        )}
      </div>
      {modal && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/45 p-4">
          <FormProvider {...form}>
            <form
              onSubmit={form.handleSubmit(submit)}
              className="mx-auto my-10 max-w-xl rounded-3xl bg-white p-7"
            >
              <div className="flex justify-between">
                <h2 className="text-2xl font-black">
                  {modal === "investor"
                    ? "Nuevo inversor"
                    : modal === "contribution"
                      ? "Registrar aporte"
                      : modal === "withdrawal"
                        ? "Retirar capital"
                        : "Distribuir ganancias"}
                </h2>
                <button type="button" onClick={() => setModal(null)}>
                  <X />
                </button>
              </div>
              <div className="mt-6 grid gap-4">
                {modal === "investor" ? (
                  <FieldInput
                    label="Nombre"
                    register={form.register("name", {
                      required: "Indica el nombre",
                    })}
                    error={form.formState.errors.name}
                  />
                ) : (
                  <>
                    {(modal === "contribution" || modal === "withdrawal") && (
                      <FieldSelect
                        label="Inversor"
                        options={data.investors
                          .filter(
                            (row) =>
                              row.isActive &&
                              (modal !== "withdrawal" || row.unitsMicros > 0),
                          )
                          .map((row) => ({ value: row.id, label: row.name }))}
                        register={form.register("investorId", {
                          required: "Selecciona un inversor",
                        })}
                      />
                    )}
                    <FieldInput
                      label={
                        modal === "distribution"
                          ? "Ganancia total a distribuir"
                          : modal === "withdrawal"
                            ? "Capital a retirar"
                            : "Valor del aporte"
                      }
                      type="number"
                      min="0.01"
                      register={form.register("amount", {
                        valueAsNumber: true,
                        required: true,
                      })}
                    />
                    {modal === "withdrawal" &&
                      (() => {
                        const selected = data.investors.find(
                          (row) => row.id === form.watch("investorId"),
                        );
                        return selected ? (
                          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">
                            Máximo según su patrimonio actual:{" "}
                            {format(selected.currentPatrimonyCents)}. El retiro
                            cancelará unidades y reducirá su porcentaje.
                          </p>
                        ) : null;
                      })()}
                    {modal === "contribution" && !data.totalUnitsMicros && (
                      <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
                        Este importe suma toda la tesorería registrada y las
                        existencias actuales valoradas a costo. Puedes ajustarlo
                        si hay deudas u otros activos todavía no registrados.
                      </p>
                    )}
                    {modal === "contribution" && data.totalUnitsMicros > 0 && (
                      <>
                        <FieldInput
                          label="Valor calculado del negocio antes del aporte"
                          type="number"
                          min="0.01"
                          register={form.register("valuation", {
                            valueAsNumber: true,
                            required: true,
                          })}
                        />
                        <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
                          Kontia calculó{" "}
                          {format(data.currentValuation.totalCents)}: tesorería{" "}
                          {format(data.currentValuation.treasuryCents)} +
                          inventario al costo{" "}
                          {format(data.currentValuation.inventoryCents)}. Puedes
                          corregirlo si existen deudas u otros activos no
                          registrados.
                        </p>
                        {projected > 0 && (
                          <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
                            Participación comprada aproximada:{" "}
                            <b>
                              {(projected * 100).toLocaleString("es", {
                                maximumFractionDigits: 2,
                              })}
                              %
                            </b>
                            .
                          </p>
                        )}
                      </>
                    )}
                    {modal === "contribution" && (
                      <FieldSelect
                        label="¿El dinero entra ahora al negocio?"
                        options={[
                          { value: "yes", label: "Sí, es dinero nuevo" },
                          { value: "no", label: "No, ya estaba dentro" },
                        ]}
                        register={form.register("affectsCash")}
                      />
                    )}{" "}
                    {(modal === "distribution" ||
                      modal === "withdrawal" ||
                      form.watch("affectsCash") === "yes") && (
                      <MonetaryComponentsEditor
                        settings={settings}
                        drafts={drafts}
                        onChange={setDrafts}
                        totalBaseCents={amountCents}
                      />
                    )}
                    <FieldDateTimePicker
                      label="Fecha"
                      register={form.register("entryDate", { required: true })}
                    />
                  </>
                )}
                <FieldTextarea
                  label="Notas"
                  register={form.register("notes")}
                />
              </div>
              {error && (
                <p className="mt-4 text-sm font-bold text-red-600">{error}</p>
              )}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="font-black text-slate-500"
                >
                  Cancelar
                </button>
                <button className="rounded-xl bg-emerald-700 px-5 py-2.5 font-black text-white">
                  Guardar
                </button>
              </div>
            </form>
          </FormProvider>
        </div>
      )}
    </section>
  );
}
