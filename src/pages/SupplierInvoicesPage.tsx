import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Banknote, Eye, FileText, Pencil, Plus, Search, X } from "lucide-react";
import { api } from "../api";
import { formatDatabaseDateTime } from "../dateTime";
import {
  FieldDateTimePicker,
  FieldInput,
  FieldSelect,
  FieldTextarea,
} from "../components/fields";
import { PageSpinner } from "../components/Spinner";
import type {
  InvoiceReconciliationMovement,
  Supplier,
  SupplierInvoice,
  MoneySettings,
} from "../types";
import {
  MonetaryComponentsEditor,
  draftToComponent,
  newPaymentDraft,
  type PaymentDraft,
} from "../components/MonetaryComponentsEditor";

const formatMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat("es", { style: "currency", currency }).format(
    cents / 100,
  );

function generateInvoiceNumber() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const random = Math.floor(100 + Math.random() * 900);
  return `${day}${month}${random}`;
}

export function SupplierInvoicesPage() {
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierInvoice | null>(null);
  const [details, setDetails] = useState<{
    invoice: SupplierInvoice;
    movements: InvoiceReconciliationMovement[];
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [moneySettings, setMoneySettings] = useState<MoneySettings | null>(
    null,
  );
  const [paying, setPaying] = useState<SupplierInvoice | null>(null);
  const [paymentDrafts, setPaymentDrafts] = useState<PaymentDraft[]>([]);
  const money = (cents: number) =>
    formatMoney(cents, moneySettings?.baseCurrency ?? "CUP");
  const methods = useForm<{
    supplierId: string;
    invoiceNumber: string;
    invoiceDate: string;
    totalAmount: number;
    notes: string;
  }>({
    defaultValues: {
      supplierId: "",
      invoiceNumber: "",
      invoiceDate: new Date().toISOString().slice(0, 10),
      totalAmount: 0,
      notes: "",
    },
  });
  async function load() {
    const [i, s, moneyConfig] = await Promise.all([
      api.supplierInvoices(),
      api.suppliers(),
      api.moneySettings(),
    ]);
    setInvoices(i.invoices);
    setSuppliers(s.suppliers);
    setMoneySettings(moneyConfig);
  }
  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, []);
  const visible = useMemo(
    () =>
      invoices.filter((i) =>
        `${i.invoiceNumber} ${i.supplierName}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [invoices, query],
  );
  function showForm(invoice?: SupplierInvoice) {
    setEditing(invoice ?? null);
    setError("");
    methods.reset(
      invoice
        ? {
            supplierId: invoice.supplierId,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate,
            totalAmount: invoice.totalAmountCents / 100,
            notes: invoice.notes ?? "",
          }
        : {
            supplierId: "",
            invoiceNumber: generateInvoiceNumber(),
            invoiceDate: new Date().toISOString().slice(0, 10),
            totalAmount: 0,
            notes: "",
          },
    );
    setOpen(true);
  }
  async function showReconciliation(invoice: SupplierInvoice) {
    setError("");
    try {
      const result = await api.supplierInvoiceReconciliation(invoice.id);
      setDetails({ invoice, movements: result.movements });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo cargar la conciliación",
      );
    }
  }
  async function submit(values: {
    supplierId: string;
    invoiceNumber: string;
    invoiceDate: string;
    totalAmount: number;
    notes: string;
  }) {
    setError("");
    try {
      const input = {
        supplierId: values.supplierId,
        invoiceNumber: values.invoiceNumber,
        invoiceDate: values.invoiceDate,
        totalAmountCents: Math.round(values.totalAmount * 100),
        notes: values.notes,
      };
      editing
        ? await api.updateSupplierInvoice(editing.id, input)
        : await api.createSupplierInvoice(input);
      setOpen(false);
      setEditing(null);
      methods.reset();
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo guardar la factura",
      );
    }
  }
  function openPayment(invoice: SupplierInvoice) {
    if (!moneySettings) return;
    setPaying(invoice);
    setError("");
    setPaymentDrafts([newPaymentDraft(moneySettings.baseCurrency)]);
  }
  async function submitPayment(event: React.FormEvent) {
    event.preventDefault();
    if (!paying || !moneySettings) return;
    try {
      const components = paymentDrafts
        .map((row) => draftToComponent(row, moneySettings))
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
      await api.addSupplierInvoicePayment(paying.id, {
        paymentDate: new Date().toISOString(),
        components,
      });
      setPaying(null);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo registrar el pago",
      );
    }
  }
  if (loading) return <PageSpinner label="Cargando facturas…" />;
  return (
    <section>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-emerald-700">
            Compras
          </p>
          <h1 className="mt-1 text-3xl font-black">Facturas de proveedores</h1>
          <p className="mt-2 text-slate-500">
            Documentos de compra vinculables con los lotes recibidos.
          </p>
        </div>
        <button
          disabled={suppliers.length === 0}
          onClick={() => showForm()}
          className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 font-black text-white disabled:opacity-40"
        >
          <Plus size={18} /> Nueva factura
        </button>
      </div>
      {suppliers.length === 0 && (
        <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
          Primero debes registrar al menos un proveedor.
        </p>
      )}
      <div className="mt-6 rounded-3xl bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 p-4">
          <Search className="text-slate-400" size={20} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por proveedor o número"
            className="w-full bg-transparent py-2 outline-none"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-4">Factura</th>
                <th>Proveedor</th>
                <th>Fecha</th>
                <th>Total</th>
                <th>Lotes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((invoice) => {
                const difference =
                  invoice.totalAmountCents - invoice.batchesTotalCents;
                const reconciled = !invoice.hasInvalidCosts && difference === 0;
                return (
                  <tr
                    key={invoice.id}
                    className="border-t border-slate-100 align-top"
                  >
                    <td className="px-5 py-4 font-black">
                      {invoice.invoiceNumber}
                    </td>
                    <td className="font-bold">{invoice.supplierName}</td>
                    <td>{invoice.invoiceDate}</td>
                    <td className="py-3">
                      <p
                        className={`font-black ${reconciled ? "text-emerald-700" : "text-red-700"}`}
                      >
                        {money(invoice.totalAmountCents)}
                      </p>
                      {!reconciled && (
                        <div className="mt-1 text-xs font-bold text-red-600">
                          <p>Lotes: {money(invoice.batchesTotalCents)}</p>
                          <p>Diferencia: {money(difference)}</p>
                          <button
                            type="button"
                            onClick={() => void showReconciliation(invoice)}
                            className="mt-1 inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 hover:bg-red-100"
                          >
                            <Eye size={14} /> Ver detalles
                          </button>
                        </div>
                      )}
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Pagado: {money(invoice.paidAmountCents)} · Pendiente:{" "}
                        {money(invoice.pendingAmountCents)}
                      </p>
                    </td>
                    <td>{invoice.batchCount}</td>
                    <td className="px-5 text-right">
                      {invoice.pendingAmountCents > 0 && (
                        <button
                          onClick={() => openPayment(invoice)}
                          className="mr-2 rounded-xl border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50"
                          aria-label={`Pagar factura ${invoice.invoiceNumber}`}
                        >
                          <Banknote size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => showForm(invoice)}
                        className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"
                        aria-label={`Editar factura ${invoice.invoiceNumber}`}
                      >
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visible.length === 0 && (
          <div className="grid place-items-center p-14 text-slate-400">
            <FileText size={40} />
            <p className="mt-3 font-bold">No hay facturas para mostrar.</p>
          </div>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4">
          <FormProvider {...methods}>
            <form
              onSubmit={methods.handleSubmit(submit)}
              className="w-full max-w-lg rounded-[2rem] bg-white p-7"
            >
              <div className="flex justify-between">
                <h2 className="text-2xl font-black">
                  {editing ? "Editar factura" : "Nueva factura"}
                </h2>
                <button type="button" onClick={() => setOpen(false)}>
                  <X />
                </button>
              </div>
              <div className="mt-6 grid gap-4">
                <FieldSelect
                  label="Proveedor"
                  placeholder="Selecciona un proveedor"
                  isSearchable
                  searchPlaceholder="Buscar proveedor..."
                  options={suppliers.map((s) => ({
                    value: s.id,
                    label: s.name,
                  }))}
                  getSearchFilter={(search, option) =>
                    option.label
                      .toLowerCase()
                      .includes(search.trim().toLowerCase())
                  }
                  register={methods.register("supplierId", {
                    required: "Selecciona un proveedor",
                  })}
                  error={methods.formState.errors.supplierId}
                />
                <FieldInput
                  label="Número de factura"
                  register={methods.register("invoiceNumber", {
                    required: "El número es obligatorio",
                  })}
                  error={methods.formState.errors.invoiceNumber}
                />
                <FieldDateTimePicker
                  label="Fecha"
                  valueFormat="date"
                  register={methods.register("invoiceDate", {
                    required: "La fecha es obligatoria",
                  })}
                  error={methods.formState.errors.invoiceDate}
                />
                <FieldInput
                  label="Importe total"
                  type="number"
                  min="0"
                  step="0.01"
                  register={methods.register("totalAmount", {
                    valueAsNumber: true,
                    required: "El importe es obligatorio",
                    min: {
                      value: 0,
                      message: "El importe no puede ser negativo",
                    },
                  })}
                  error={methods.formState.errors.totalAmount}
                />
                <FieldTextarea
                  label="Notas"
                  rows={3}
                  register={methods.register("notes")}
                />
              </div>
              {error && (
                <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
                  {error}
                </p>
              )}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 font-black text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  disabled={methods.formState.isSubmitting}
                  className="rounded-xl bg-emerald-700 px-5 py-2.5 font-black text-white"
                >
                  {editing ? "Guardar cambios" : "Guardar"}
                </button>
              </div>
            </form>
          </FormProvider>
        </div>
      )}
      {paying && moneySettings && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/45 p-4">
          <form
            onSubmit={submitPayment}
            className="mx-auto my-10 max-w-3xl rounded-3xl bg-white p-7"
          >
            <div className="flex justify-between">
              <div>
                <h2 className="text-2xl font-black">
                  Pagar factura {paying.invoiceNumber}
                </h2>
                <p className="text-sm text-slate-500">
                  Pendiente: {money(paying.pendingAmountCents)}
                </p>
              </div>
              <button type="button" onClick={() => setPaying(null)}>
                <X />
              </button>
            </div>
            <div className="mt-6">
              <MonetaryComponentsEditor
                settings={moneySettings}
                drafts={paymentDrafts}
                onChange={setPaymentDrafts}
                totalBaseCents={paying.pendingAmountCents}
              />
            </div>
            {error && <p className="mt-4 font-bold text-red-600">{error}</p>}
            <button className="mt-6 w-full rounded-xl bg-emerald-700 p-3 font-black text-white">
              Registrar pago
            </button>
          </form>
        </div>
      )}
      {details && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/45 p-4">
          <div className="mx-auto my-10 w-full max-w-5xl rounded-[2rem] bg-white p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">
                  Detalles de conciliación
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Factura {details.invoice.invoiceNumber} ·{" "}
                  {details.invoice.supplierName}
                </p>
              </div>
              <button type="button" onClick={() => setDetails(null)}>
                <X />
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase text-slate-400">
                  Monto factura
                </p>
                <p className="mt-1 text-xl font-black">
                  {money(details.invoice.totalAmountCents)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase text-slate-400">
                  Monto en lotes
                </p>
                <p className="mt-1 text-xl font-black">
                  {money(details.invoice.batchesTotalCents)}
                </p>
              </div>
              <div className="rounded-2xl bg-red-50 p-4">
                <p className="text-xs font-black uppercase text-red-500">
                  Diferencia
                </p>
                <p className="mt-1 text-xl font-black text-red-700">
                  {money(
                    details.invoice.totalAmountCents -
                      details.invoice.batchesTotalCents,
                  )}
                </p>
              </div>
            </div>
            {!!details.invoice.hasInvalidCosts && (
              <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-black text-red-700">
                Hay lotes sin un costo válido. Revisa su costo unitario.
              </p>
            )}
            <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[780px] text-left">
                <thead className="text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th>Producto</th>
                    <th>Lote</th>
                    <th>Movimiento</th>
                    <th>Cantidad</th>
                    <th>Costo unitario</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {details.movements.map((movement) => (
                    <tr key={movement.id} className="border-t">
                      <td className="px-4 py-3">
                        {formatDatabaseDateTime(movement.createdAt)}
                      </td>
                      <td className="font-black">{movement.productName}</td>
                      <td>
                        <p className="font-mono text-xs">
                          {movement.batchId.slice(0, 8)}
                        </p>
                        <p className="text-xs text-slate-400">
                          {new Date(movement.receivedAt).toLocaleDateString(
                            "es",
                          )}
                        </p>
                      </td>
                      <td>
                        {movement.movementType === "purchase"
                          ? "Compra"
                          : movement.movementType === "positiveAdjustment"
                            ? "Ajuste positivo"
                            : "Ajuste negativo"}
                      </td>
                      <td className="font-bold">{movement.quantity}</td>
                      <td>{money(movement.unitCostCents)}</td>
                      <td
                        className={`font-black ${movement.totalCostCents < 0 ? "text-red-700" : ""}`}
                      >
                        {money(movement.totalCostCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!details.movements.length && (
                <p className="p-10 text-center font-bold text-slate-400">
                  No hay compras o ajustes asociados a los lotes de esta
                  factura.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
