import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Plus, X } from "lucide-react";
import { FormProvider, useForm } from "react-hook-form";
import { api } from "../api";
import type { MoneySettings } from "../types";
import { PageSpinner } from "../components/Spinner";
import { FieldInput, FieldSelect, FieldTextarea } from "../components/fields";
import { rememberedExchangeRate, rememberExchangeRate } from "../exchangeRates";

type Exchange = Awaited<
  ReturnType<typeof api.currencyExchanges>
>["exchanges"][number];
type ExchangeForm = {
  sourceCurrency: string;
  sourceAmount: number;
  targetCurrency: string;
  targetAmount: number;
  rate: number;
  notes: string;
};
export function MoneyPage() {
  const [settings, setSettings] = useState<MoneySettings | null>(null),
    [items, setItems] = useState<Exchange[]>([]),
    [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const exchangeForm = useForm<ExchangeForm>({
    defaultValues: {
      sourceCurrency: "",
      sourceAmount: 0,
      targetCurrency: "",
      targetAmount: 0,
      rate: 1,
      notes: "",
    },
  });
  const synchronizingAmounts = useRef(false);
  const defaultFormValues = (money: MoneySettings): ExchangeForm => {
    const currencies = money.currencies
        .filter((row) => row.isActive)
        .map((row) => row.currencyCode),
      targetCurrency =
        currencies.find((currency) => currency !== money.baseCurrency) ??
        money.baseCurrency;
    return {
      sourceCurrency: money.baseCurrency,
      sourceAmount: 0,
      targetCurrency,
      targetAmount: 0,
      rate: rememberedExchangeRate(money.baseCurrency, targetCurrency) ?? 1,
      notes: "",
    };
  };
  const load = async () => {
    const [money, exchanges] = await Promise.all([
      api.moneySettings(),
      api.currencyExchanges(),
    ]);
    setSettings(money);
    setItems(exchanges.exchanges);
    if (!exchangeForm.getValues("sourceCurrency"))
      exchangeForm.reset(defaultFormValues(money));
  };
  useEffect(() => {
    void load().catch((reason: Error) => setError(reason.message));
  }, []);
  useEffect(() => {
    const subscription = exchangeForm.watch((values, { name }) => {
      if (!settings || !name || synchronizingAmounts.current) return;
      const sourceAmount = Number(values.sourceAmount),
        targetAmount = Number(values.targetAmount),
        foreignCurrency =
          values.targetCurrency !== settings.baseCurrency
            ? String(values.targetCurrency)
            : String(values.sourceCurrency),
        savedRate = ["sourceCurrency", "targetCurrency"].includes(name)
          ? rememberedExchangeRate(settings.baseCurrency, foreignCurrency)
          : undefined,
        rate = savedRate ?? Number(values.rate),
        sourceRate = values.sourceCurrency === settings.baseCurrency ? 1 : rate,
        targetRate = values.targetCurrency === settings.baseCurrency ? 1 : rate;
      if (!(sourceRate > 0) || !(targetRate > 0)) return;
      const roundAmount = (amount: number) =>
        Math.round(amount * 1_000_000) / 1_000_000;
      synchronizingAmounts.current = true;
      if (savedRate !== undefined)
        exchangeForm.setValue("rate", savedRate, {
          shouldDirty: true,
          shouldValidate: true,
        });
      if (name === "rate")
        rememberExchangeRate(
          settings.baseCurrency,
          foreignCurrency,
          Number(values.rate),
        );
      if (
        ["targetAmount", "rate", "sourceCurrency", "targetCurrency"].includes(
          name,
        ) &&
        Number.isFinite(targetAmount)
      ) {
        exchangeForm.setValue(
          "sourceAmount",
          roundAmount((targetAmount * targetRate) / sourceRate),
          { shouldDirty: true, shouldValidate: true },
        );
      } else if (name === "sourceAmount" && Number.isFinite(sourceAmount)) {
        exchangeForm.setValue(
          "targetAmount",
          roundAmount((sourceAmount * sourceRate) / targetRate),
          { shouldDirty: true, shouldValidate: true },
        );
      }
      synchronizingAmounts.current = false;
    });
    return () => subscription.unsubscribe();
  }, [exchangeForm, settings]);
  if (!settings) return <PageSpinner label="Cargando monedas…" />;
  const active = settings.currencies
      .filter((r) => r.isActive)
      .map((r) => r.currencyCode),
    cashBalances = active.map((currencyCode) => {
      const rows = (settings.cashReconciliation ?? []).filter(
          (row) => row.currencyCode === currencyCode,
        ),
        inflowMinor = rows.reduce((sum, row) => sum + row.inflowMinor, 0),
        outflowMinor = rows.reduce((sum, row) => sum + row.outflowMinor, 0);
      return {
        currencyCode,
        inflowMinor,
        outflowMinor,
        balanceMinor: inflowMinor - outflowMinor,
      };
    }),
    account = (currency: string) =>
      settings.accounts.find(
        (r) =>
          r.currencyCode === currency &&
          r.accountType === "cashDrawer" &&
          r.isActive,
      );
  async function submit(values: ExchangeForm) {
    setError("");
    const sourceAccount = account(values.sourceCurrency),
      targetAccount = account(values.targetCurrency);
    if (!sourceAccount || !targetAccount)
      return setError("No existe una cuenta de efectivo para una moneda");
    const sourceRate =
        values.sourceCurrency === settings!.baseCurrency ? 1 : values.rate,
      targetRate =
        values.targetCurrency === settings!.baseCurrency ? 1 : values.rate,
      sourceBase = Math.round(values.sourceAmount * sourceRate * 100),
      targetBase = Math.round(values.targetAmount * targetRate * 100);
    if (sourceBase !== targetBase)
      return setError(
        "La entrada y la salida deben tener el mismo equivalente base",
      );
    const foreignCurrency =
      values.targetCurrency !== settings!.baseCurrency
        ? values.targetCurrency
        : values.sourceCurrency;
    rememberExchangeRate(settings!.baseCurrency, foreignCurrency, values.rate);
    try {
      await api.createCurrencyExchange({
        exchangeDate: new Date().toISOString(),
        notes: values.notes,
        source: {
          moneyAccountId: sourceAccount.id,
          paymentMethod: "cash",
          currencyCode: values.sourceCurrency,
          amountMinor: Math.round(values.sourceAmount * 100),
          exchangeRateScaled: Math.round(sourceRate * 1e6),
          baseAmountCents: sourceBase,
        },
        target: {
          moneyAccountId: targetAccount.id,
          paymentMethod: "cash",
          currencyCode: values.targetCurrency,
          amountMinor: Math.round(values.targetAmount * 100),
          exchangeRateScaled: Math.round(targetRate * 1e6),
          baseAmountCents: targetBase,
        },
      });
      setOpen(false);
      exchangeForm.reset(defaultFormValues(settings!));
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo registrar el cambio",
      );
    }
  }
  return (
    <section>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-emerald-700">
            Tesorería
          </p>
          <h1 className="mt-1 text-3xl font-black">Cambios de moneda</h1>
          <p className="mt-2 text-slate-500">
            Transforma saldos sin generar ingresos ni gastos.
          </p>
        </div>
        <button
          disabled={active.length < 2}
          onClick={() => {
            exchangeForm.reset(defaultFormValues(settings));
            setOpen(true);
          }}
          className="flex items-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 font-black text-white disabled:opacity-40"
        >
          <Plus size={18} />
          Nuevo cambio
        </button>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cashBalances.map((row) => (
          <div
            key={row.currencyCode}
            className="rounded-2xl bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-bold uppercase text-slate-400">
              Efectivo {row.currencyCode}
            </p>
            <p className="mt-2 text-2xl font-black">
              {(row.balanceMinor / 100).toLocaleString("es")} {row.currencyCode}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Entradas {(row.inflowMinor / 100).toLocaleString("es")} · Salidas{" "}
              {(row.outflowMinor / 100).toLocaleString("es")}
            </p>
          </div>
        ))}
      </div>
      {error && (
        <p className="mt-4 rounded-xl bg-red-50 p-3 font-bold text-red-700">
          {error}
        </p>
      )}
      <div className="mt-6 overflow-x-auto rounded-3xl bg-white shadow-sm">
        <table className="w-full min-w-[700px] text-left">
          <thead className="text-xs uppercase text-slate-400">
            <tr>
              <th className="px-5 py-4">Fecha</th>
              <th>Sale</th>
              <th>Entra</th>
              <th>Tasa</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const source = item.components.find((r) => r.flow === "outflow"),
                target = item.components.find((r) => r.flow === "inflow");
              return (
                <tr key={item.id} className="border-t">
                  <td className="px-5 py-4">
                    {new Date(item.exchangeDate).toLocaleString("es")}
                  </td>
                  <td className="font-black text-red-600">
                    {source
                      ? `${(source.amountMinor / 100).toLocaleString("es")} ${source.currencyCode}`
                      : "—"}
                  </td>
                  <td className="font-black text-emerald-700">
                    {target
                      ? `${(target.amountMinor / 100).toLocaleString("es")} ${target.currencyCode}`
                      : "—"}
                  </td>
                  <td>{item.exchangeRateScaled / 1e6}</td>
                  <td>{item.notes || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!items.length && (
          <p className="p-12 text-center font-bold text-slate-400">
            No hay cambios registrados.
          </p>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/45 p-4">
          <FormProvider {...exchangeForm}>
            <form
              onSubmit={exchangeForm.handleSubmit(submit)}
              className="mx-auto my-10 max-w-xl rounded-3xl bg-white p-7"
            >
              <div className="flex justify-between">
                <h2 className="text-2xl font-black">Nuevo cambio</h2>
                <button type="button" onClick={() => setOpen(false)}>
                  <X />
                </button>
              </div>
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                  <p className="mb-3 text-sm font-black uppercase tracking-wide text-emerald-700">
                    Entrante
                  </p>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(110px,0.65fr)] gap-3">
                    <FieldInput
                      label="Importe"
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      register={exchangeForm.register("targetAmount", {
                        valueAsNumber: true,
                        required: "Indica el importe",
                        min: {
                          value: 0.000001,
                          message: "Debe ser mayor que 0",
                        },
                      })}
                      error={exchangeForm.formState.errors.targetAmount}
                    />
                    <FieldSelect
                      label="Moneda"
                      options={active.map((currency) => ({
                        value: currency,
                        label: currency,
                      }))}
                      register={exchangeForm.register("targetCurrency", {
                        required: "Selecciona una moneda",
                      })}
                      error={exchangeForm.formState.errors.targetCurrency}
                    />
                  </div>
                </div>
                <FieldInput
                  label={`Tasa respecto a ${settings.baseCurrency}`}
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  register={exchangeForm.register("rate", {
                    valueAsNumber: true,
                    required: "Indica la tasa",
                    min: { value: 0.000001, message: "Debe ser mayor que 0" },
                  })}
                  error={exchangeForm.formState.errors.rate}
                />
                <div className="rounded-2xl border border-red-100 bg-red-50/50 p-4">
                  <p className="mb-3 text-sm font-black uppercase tracking-wide text-red-700">
                    Saliente
                  </p>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(110px,0.65fr)] gap-3">
                    <FieldInput
                      label="Importe"
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      register={exchangeForm.register("sourceAmount", {
                        valueAsNumber: true,
                        required: "Indica el importe",
                        min: {
                          value: 0.000001,
                          message: "Debe ser mayor que 0",
                        },
                      })}
                      error={exchangeForm.formState.errors.sourceAmount}
                    />
                    <FieldSelect
                      label="Moneda"
                      options={active.map((currency) => ({
                        value: currency,
                        label: currency,
                      }))}
                      register={exchangeForm.register("sourceCurrency", {
                        required: "Selecciona una moneda",
                      })}
                      error={exchangeForm.formState.errors.sourceCurrency}
                    />
                  </div>
                </div>
                <FieldTextarea
                  label="Notas"
                  register={exchangeForm.register("notes")}
                  error={exchangeForm.formState.errors.notes}
                />
              </div>
              <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 p-3 font-black text-white">
                <ArrowLeftRight size={18} />
                Registrar cambio
              </button>
            </form>
          </FormProvider>
        </div>
      )}
    </section>
  );
}
