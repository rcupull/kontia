import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import {
  FormProvider,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import type { MonetaryComponentInput, MoneySettings } from "../types";
import { rememberedExchangeRate, rememberExchangeRate } from "../exchangeRates";
import { FieldInput, FieldSelect } from "./fields";

export type PaymentDraft = {
  id: string;
  currencyCode: string;
  amount: number;
  rate: number;
  paymentMethod: "cash" | "card" | "transfer";
};

type MonetaryComponentsForm = {
  components: PaymentDraft[];
};

export const newPaymentDraft = (baseCurrency: string): PaymentDraft => ({
  id: crypto.randomUUID(),
  currencyCode: baseCurrency,
  amount: 0,
  rate: 1,
  paymentMethod: "cash",
});

const normalizeDrafts = (
  drafts: Array<Partial<PaymentDraft> | undefined>,
): PaymentDraft[] =>
  drafts.map((draft) => ({
    id: draft?.id ?? crypto.randomUUID(),
    currencyCode: draft?.currencyCode ?? "",
    amount: Number.isFinite(draft?.amount) ? Number(draft?.amount) : 0,
    rate: Number.isFinite(draft?.rate) ? Number(draft?.rate) : 0,
    paymentMethod: draft?.paymentMethod ?? "cash",
  }));

const draftsSignature = (drafts: PaymentDraft[]) => JSON.stringify(drafts);

export function draftToComponent(
  draft: PaymentDraft,
  settings: MoneySettings,
): MonetaryComponentInput | null {
  const accountType =
    draft.paymentMethod === "cash" ? "cashDrawer" : "bankAccount";
  const account = settings.accounts.find(
    (row) =>
      row.currencyCode === draft.currencyCode &&
      row.accountType === accountType &&
      row.isActive,
  );
  if (!account || draft.amount <= 0 || draft.rate <= 0) return null;
  return {
    moneyAccountId: account.id,
    paymentMethod: draft.paymentMethod,
    currencyCode: draft.currencyCode,
    amountMinor: Math.round(draft.amount * 100),
    exchangeRateScaled: Math.round(draft.rate * 1_000_000),
    baseAmountCents: Math.round(draft.amount * draft.rate * 100),
  };
}

export function MonetaryComponentsEditor({
  settings,
  drafts,
  onChange,
  totalBaseCents,
}: {
  settings: MoneySettings;
  drafts: PaymentDraft[];
  onChange: (drafts: PaymentDraft[]) => void;
  totalBaseCents: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const methods = useForm<MonetaryComponentsForm>({
    defaultValues: { components: drafts },
  });
  const { control, getValues, register, reset, setValue, watch } = methods;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "components",
  });
  const watchedDrafts = useWatch({ control, name: "components" }) ?? [];
  const lastSynchronizedSignature = useRef(draftsSignature(drafts));
  const previousCurrencies = useRef<Record<string, string>>({});

  useEffect(() => {
    const subscription = watch((values) => {
      const nextDrafts = normalizeDrafts(values.components ?? []);
      const signature = draftsSignature(nextDrafts);
      if (signature === lastSynchronizedSignature.current) return;
      lastSynchronizedSignature.current = signature;
      onChange(nextDrafts);
    });
    return () => subscription.unsubscribe();
  }, [onChange, watch]);

  useEffect(() => {
    const externalSignature = draftsSignature(drafts);
    const formSignature = draftsSignature(
      normalizeDrafts(getValues("components")),
    );
    if (externalSignature === formSignature) {
      lastSynchronizedSignature.current = externalSignature;
      return;
    }
    lastSynchronizedSignature.current = externalSignature;
    reset({ components: drafts });
  }, [drafts, getValues, reset]);

  useEffect(() => {
    watchedDrafts.forEach((draft, index) => {
      const previousCurrency = previousCurrencies.current[draft.id];
      if (previousCurrency === undefined) {
        previousCurrencies.current[draft.id] = draft.currencyCode;
      } else if (previousCurrency !== draft.currencyCode) {
        previousCurrencies.current[draft.id] = draft.currencyCode;
        const remembered = rememberedExchangeRate(
          settings.baseCurrency,
          draft.currencyCode,
        );
        if (
          draft.currencyCode !== settings.baseCurrency &&
          remembered !== undefined &&
          Number(draft.rate) !== remembered
        ) {
          setValue(`components.${index}.rate`, remembered, {
            shouldDirty: true,
            shouldValidate: true,
          });
          return;
        }
      }
      if (
        draft.currencyCode === settings.baseCurrency &&
        Number(draft.rate) !== 1
      ) {
        setValue(`components.${index}.rate`, 1, {
          shouldDirty: true,
          shouldValidate: true,
        });
      } else {
        rememberExchangeRate(
          settings.baseCurrency,
          draft.currencyCode,
          Number(draft.rate),
        );
      }
    });
  }, [setValue, settings.baseCurrency, watchedDrafts]);

  const activeCurrencies = settings.currencies.filter((row) => row.isActive);
  const currencyOptions = activeCurrencies.map((currency) => ({
    value: currency.currencyCode,
    label: currency.currencyCode,
  }));
  const paymentMethodOptions = [
    { value: "cash", label: "Efectivo" },
    { value: "card", label: "Tarjeta" },
    { value: "transfer", label: "Transf" },
  ];
  const normalizedWatchedDrafts = normalizeDrafts(watchedDrafts);
  const components = normalizedWatchedDrafts
    .map((draft) => draftToComponent(draft, settings))
    .filter((row): row is MonetaryComponentInput => Boolean(row));
  const applied = components.reduce((sum, row) => sum + row.baseAmountCents, 0);
  const pending = totalBaseCents - applied;
  const methodName = (method: PaymentDraft["paymentMethod"]) =>
    method === "cash"
      ? "Efectivo"
      : method === "card"
        ? "Tarjeta"
        : "Transferencia";
  const summary =
    normalizedWatchedDrafts.length === 1
      ? `Importe: ${methodName(normalizedWatchedDrafts[0].paymentMethod)} · ${normalizedWatchedDrafts[0].currencyCode}`
      : `${normalizedWatchedDrafts.length} importes`;

  return (
    <FormProvider {...methods}>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-2">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left text-xs text-slate-500 hover:bg-white"
          aria-expanded={expanded}
        >
          <span>
            <span className="font-black text-slate-700">{summary}</span>
            {pending !== 0 && (
              <span className="ml-2 font-black text-amber-700">
                · {pending > 0 ? "Falta" : "Excede"}{" "}
                {(Math.abs(pending) / 100).toLocaleString("es")}{" "}
                {settings.baseCurrency}
              </span>
            )}
          </span>
          {expanded ? (
            <ChevronUp size={16} className="shrink-0" />
          ) : (
            <ChevronDown size={16} className="shrink-0" />
          )}
        </button>
        {expanded && (
          <div className="mt-2 border-t border-slate-200 p-2 pt-4">
            <div>
              <p className="font-black">Importes y monedas</p>
              <p className="text-xs text-slate-500">
                Indica el importe, la moneda, la tasa y el medio utilizado.
              </p>
            </div>
            <div className="mt-4 space-y-4">
              {fields.map((field, index) => {
                const draft = normalizedWatchedDrafts[index] ?? field;
                const baseCents = Math.round(
                  Number(draft.amount || 0) * Number(draft.rate || 0) * 100,
                );
                const isBaseCurrency =
                  draft.currencyCode === settings.baseCurrency;
                return (
                  <div
                    key={field.id}
                    className="relative grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-4"
                  >
                    <p className="col-span-2 pr-10 text-xs font-black uppercase tracking-wide text-slate-400">
                      Importe {index + 1}
                    </p>
                    <FieldInput
                      label="Importe"
                      type="number"
                      min="0"
                      step="0.01"
                      register={register(`components.${index}.amount`, {
                        valueAsNumber: true,
                        min: {
                          value: 0,
                          message: "El importe no puede ser menor que 0",
                        },
                      })}
                    />
                    <FieldSelect
                      label="Moneda"
                      options={currencyOptions}
                      register={register(`components.${index}.currencyCode`, {
                        required: "Selecciona una moneda",
                      })}
                    />
                    <FieldInput
                      label="Tasa"
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      disabled={isBaseCurrency}
                      register={register(`components.${index}.rate`, {
                        valueAsNumber: true,
                        min: {
                          value: 0.000001,
                          message: "La tasa debe ser mayor que 0",
                        },
                      })}
                    />
                    <FieldSelect
                      label="Medio"
                      options={paymentMethodOptions}
                      register={register(`components.${index}.paymentMethod`, {
                        required: "Selecciona un medio",
                      })}
                    />
                    <button
                      type="button"
                      aria-label="Eliminar componente monetario"
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                      className="absolute right-2 top-2 rounded-lg p-2 text-red-600 disabled:opacity-30"
                    >
                      <Trash2 size={17} />
                    </button>
                    <p className="col-span-2 text-xs font-black text-emerald-700">
                      Equivalente: {(baseCents / 100).toLocaleString("es")}{" "}
                      {settings.baseCurrency}
                    </p>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => append(newPaymentDraft(settings.baseCurrency))}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 bg-emerald-50 px-3 py-3 text-sm font-black text-emerald-800 shadow-sm transition hover:bg-emerald-100 hover:shadow-md"
            >
              <Plus size={16} /> Agregar otro importe
            </button>
            <div
              className={`mt-3 flex justify-between rounded-xl p-3 text-sm font-black ${pending === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
            >
              <span>
                {pending === 0
                  ? "Operación cubierta"
                  : pending > 0
                    ? "Faltante"
                    : "Importe excedido"}
              </span>
              <span>
                {(Math.abs(pending) / 100).toLocaleString("es")}{" "}
                {settings.baseCurrency}
              </span>
            </div>
          </div>
        )}
      </div>
    </FormProvider>
  );
}
