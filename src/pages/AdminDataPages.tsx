import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import {
  Banknote,
  Boxes,
  Eye,
  Pencil,
  Plus,
  Receipt,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { api } from "../api";
import {
  FieldDateTimePicker,
  FieldInput,
  FieldSelect,
  FieldTextarea,
} from "../components/fields";
import type { CashSession, FinancialMovement, Sale } from "../types";
import { PageSpinner } from "../components/Spinner";

const money = (cents: number) =>
  new Intl.NumberFormat("es", { style: "currency", currency: "CUP" }).format(
    Number(cents || 0) / 100,
  );
const date = (value?: string) =>
  value ? new Date(value).toLocaleString("es") : "Pendiente";
const expenseTypes = [
  ["salary", "Salario"],
  ["bonus", "Bonificación"],
  ["tax", "Impuesto"],
  ["rent", "Alquiler"],
  ["utilities", "Servicios"],
  ["marketing", "Marketing"],
  ["supplies", "Suministros"],
  ["maintenance", "Mantenimiento"],
  ["transportation", "Transporte"],
  ["software", "Software"],
  ["other", "Otro"],
] as const;
const financialTypes = [
  ["capitalInjection", "Inyección de capital"],
  ["sessionClose", "Cierre de caja"],
  ["operatingExpense", "Gasto operativo"],
  ["inventoryReinvestment", "Reinversión en inventario"],
  ["ownerWithdrawal", "Retiro del propietario"],
  ["saleRefund", "Reintegro de venta"],
  ["positiveAdjustment", "Ajuste positivo"],
  ["negativeAdjustment", "Ajuste negativo"],
] as const;
const label = (
  options: readonly (readonly [string, string])[],
  value: string,
) => options.find(([key]) => key === value)?.[1] ?? value;

function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-sm font-black uppercase tracking-wider text-emerald-700">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-3xl font-black">{title}</h1>
        <p className="mt-2 text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}
function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white px-4 shadow-sm">
      <Search size={19} className="text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent py-3.5 outline-none"
      />
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="p-12 text-center font-bold text-slate-400">{text}</p>;
}

function LegacyDashboardPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    void api.dashboard().then(setData);
  }, []);
  if (!data)
    return <p className="font-bold text-slate-500">Cargando indicadores…</p>;
  const cards = [
    [
      "Ventas netas",
      money(data.sales.salesCents),
      TrendingUp,
      "text-emerald-700 bg-emerald-50",
    ],
    ["Órdenes", String(data.sales.orders), Receipt, "text-blue-700 bg-blue-50"],
    [
      "Unidades en inventario",
      String(data.inventory.units),
      Boxes,
      "text-violet-700 bg-violet-50",
    ],
    [
      "Balance financiero",
      money(data.finance.balanceCents),
      Banknote,
      "text-amber-700 bg-amber-50",
    ],
  ] as const;
  return (
    <section>
      <Heading
        eyebrow="Resumen"
        title="Dashboard"
        description="Indicadores reales de ventas, inventario y finanzas."
      />
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([title, value, Icon, color]) => (
          <div key={title} className="rounded-3xl bg-white p-5 shadow-sm">
            <span className={`inline-grid rounded-2xl p-3 ${color}`}>
              <Icon />
            </span>
            <p className="mt-4 text-sm font-bold text-slate-500">{title}</p>
            <p className="mt-1 text-2xl font-black">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-3xl bg-white shadow-sm">
        <h2 className="p-5 text-xl font-black">Ventas recientes</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="px-5 py-3">Fecha</th>
                <th>Vendedor</th>
                <th>Método</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSales.map((s: any) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-5 py-4">{date(s.createdAt)}</td>
                  <td>{s.sellerName}</td>
                  <td>{s.paymentMethod === "cash" ? "Efectivo" : "Tarjeta"}</td>
                  <td className="font-black">{money(s.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.recentSales.length && (
          <Empty text="No hay ventas registradas." />
        )}
      </div>
    </section>
  );
}

export function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Sale | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        void api
          .adminSales(search)
          .then((r) => setSales(r.sales))
          .finally(() => setLoading(false)),
      200,
    );
    return () => clearTimeout(timer);
  }, [search]);
  if (loading) return <PageSpinner label="Cargando ventas…" />;
  return (
    <section>
      <Heading
        eyebrow="Operaciones"
        title="Ventas"
        description="Historial de órdenes, artículos y devoluciones."
      />
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Buscar por producto, vendedor o total"
      />
      <div className="mt-4 overflow-x-auto rounded-3xl bg-white shadow-sm">
        <table className="w-full min-w-[1000px] text-left">
          <thead className="text-xs uppercase text-slate-400">
            <tr>
              <th className="px-5 py-4">Fecha</th>
              <th>Estado</th>
              <th>Método</th>
              <th>Total</th>
              <th>Productos</th>
              <th>Vendedor</th>
              <th>Ubicación</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="px-5 py-4">{date(s.createdAt)}</td>
                <td>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${s.refundId ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}
                  >
                    {s.refundId ? "Anulada" : "Válida"}
                  </span>
                </td>
                <td>{s.paymentMethod === "cash" ? "Efectivo" : "Tarjeta"}</td>
                <td
                  className={`font-black ${s.refundId ? "text-red-600 line-through" : ""}`}
                >
                  {money(s.totalCents)}
                </td>
                <td>{s.items.length}</td>
                <td>{s.sellerName}</td>
                <td>
                  <p className="font-bold">
                    {s.locationName ?? "Sin ubicación"}
                  </p>
                  {s.locationType && (
                    <span className="text-xs font-bold text-slate-400">
                      {s.locationType === "warehouse"
                        ? "Almacén"
                        : "Punto de venta"}
                    </span>
                  )}
                </td>
                <td className="pr-5 text-right">
                  <button
                    onClick={() => setSelected(s)}
                    className="rounded-xl p-2 text-emerald-700 hover:bg-emerald-50"
                    title="Ver detalle"
                  >
                    <Eye size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!sales.length && <Empty text="No hay ventas registradas." />}
      </div>
      {selected && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/45 p-4">
          <div className="mx-auto my-12 max-w-2xl rounded-3xl bg-white p-7">
            <div className="flex justify-between">
              <div>
                <h2 className="text-2xl font-black">Detalle de venta</h2>
                <p className="text-sm text-slate-500">
                  {date(selected.createdAt)} · {selected.sellerName}
                </p>
                <p className="mt-1 text-sm font-bold text-emerald-700">
                  {selected.locationName ?? "Sin ubicación"}
                  {selected.locationType
                    ? ` · ${selected.locationType === "warehouse" ? "Almacén" : "Punto de venta"}`
                    : ""}
                </p>
              </div>
              <button onClick={() => setSelected(null)}>
                <X />
              </button>
            </div>
            {selected.refundId && (
              <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">
                Venta anulada. {selected.refundNotes}
              </p>
            )}
            {selected.notes && (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
                Precio diferenciado: {selected.notes}
              </p>
            )}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full">
                <thead className="text-left text-xs uppercase text-slate-400">
                  <tr>
                    <th className="py-3">Producto</th>
                    <th>Cantidad</th>
                    <th>Precio</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="py-3 font-bold">{item.productName}</td>
                      <td>{item.quantity}</td>
                      <td>{money(item.unitPriceCents)}</td>
                      <td className="font-black">{money(item.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-5 text-right text-xl font-black">
              Total: {money(selected.totalCents)}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export function CashSessionsPage() {
  const [sessions, setSessions] = useState<CashSession[]>([]),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        void api
          .adminSessions(search)
          .then((r) => setSessions(r.sessions))
          .finally(() => setLoading(false)),
      200,
    );
    return () => clearTimeout(timer);
  }, [search]);
  if (loading) return <PageSpinner label="Cargando sesiones de caja…" />;
  return (
    <section>
      <Heading
        eyebrow="Caja"
        title="Sesiones de caja"
        description="Aperturas, cierres, ventas y diferencias de caja."
      />
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Buscar por vendedor"
      />
      <div className="mt-4 overflow-x-auto rounded-3xl bg-white shadow-sm">
        <table className="w-full min-w-[1200px] text-left">
          <thead className="text-xs uppercase text-slate-400">
            <tr>
              <th className="px-5 py-4">Estado</th>
              <th>Vendedor</th>
              <th>Ubicación</th>
              <th>Apertura</th>
              <th>Cierre</th>
              <th>Ventas</th>
              <th>Efectivo/Tarjeta</th>
              <th>Arqueo</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-t border-slate-100 align-top">
                <td className="px-5 py-4">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${s.status === "open" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {s.status === "open" ? "Abierta" : "Cerrada"}
                  </span>
                </td>
                <td className="font-bold">{s.sellerName}</td>
                <td>
                  <p className="font-bold">
                    {s.locationName ?? "Sin ubicación"}
                  </p>
                  {s.locationType && (
                    <span className="text-xs font-bold text-slate-400">
                      {s.locationType === "warehouse"
                        ? "Almacén"
                        : "Punto de venta"}
                    </span>
                  )}
                </td>
                <td>{date(s.openedAt)}</td>
                <td>{date(s.closedAt)}</td>
                <td>
                  <b>{money(s.netSalesCents)}</b>
                  <p className="text-xs text-slate-400">
                    {s.totalOrders} órdenes · reintegros {money(s.refundsCents)}
                  </p>
                </td>
                <td>
                  <p>Efectivo {money(s.cashSalesCents)}</p>
                  <p>Tarjeta {money(s.cardSalesCents)}</p>
                </td>
                <td>
                  <p>Inicial {money(s.openingAmountCents)}</p>
                  <p>Esperado {money(s.expectedCashAmountCents)}</p>
                  <p>
                    Contado{" "}
                    {s.countedCashAmountCents == null
                      ? "Pendiente"
                      : money(s.countedCashAmountCents)}
                  </p>
                  <b
                    className={
                      Number(s.differenceCents) < 0
                        ? "text-red-600"
                        : "text-emerald-700"
                    }
                  >
                    Diferencia{" "}
                    {s.differenceCents == null
                      ? "Pendiente"
                      : money(s.differenceCents)}
                  </b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!sessions.length && <Empty text="No hay sesiones de caja." />}
      </div>
    </section>
  );
}

type FinancialValues = {
  type: string;
  expenseType: string;
  moneyLocation: string;
  amount: number;
  description: string;
  movementDate: string;
  notes: string;
};
export function FinancialMovementsPage() {
  const [items, setItems] = useState<FinancialMovement[]>([]),
    [search, setSearch] = useState(""),
    [editing, setEditing] = useState<FinancialMovement | null | undefined>(
      undefined,
    ),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const methods = useForm<FinancialValues>();
  const load = () =>
    api.financialMovements(search).then((r) => setItems(r.movements));
  useEffect(() => {
    const timer = setTimeout(
      () => void load().finally(() => setLoading(false)),
      200,
    );
    return () => clearTimeout(timer);
  }, [search]);
  function open(item: FinancialMovement | null) {
    setError("");
    setEditing(item);
    methods.reset({
      type: item?.type ?? "capitalInjection",
      expenseType: item?.expenseType ?? "",
      moneyLocation: item?.moneyLocation ?? "cashDeposit",
      amount: (item?.amountCents ?? 0) / 100,
      description: item?.description ?? "",
      movementDate: item?.movementDate ?? new Date().toISOString(),
      notes: item?.notes ?? "",
    });
  }
  async function submit(v: FinancialValues) {
    try {
      await api.saveFinancialMovement(editing?.id ?? null, {
        type: v.type,
        expenseType:
          v.type === "operatingExpense"
            ? v.expenseType || undefined
            : undefined,
        moneyLocation: v.moneyLocation,
        amountCents: Math.round(v.amount * 100),
        description: v.description,
        movementDate: v.movementDate,
        notes: v.notes || undefined,
      });
      setEditing(undefined);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }
  if (loading) return <PageSpinner label="Cargando finanzas…" />;
  return (
    <section>
      <Heading
        eyebrow="Finanzas"
        title="Movimientos financieros"
        description="Entradas y salidas de efectivo y cuenta bancaria."
        action={
          <button
            onClick={() => open(null)}
            className="flex items-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 font-black text-white"
          >
            <Plus size={18} />
            Nuevo movimiento
          </button>
        }
      />
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Buscar por descripción, notas, tipo o ubicación"
      />
      <div className="mt-4 overflow-x-auto rounded-3xl bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-left">
          <thead className="text-xs uppercase text-slate-400">
            <tr>
              <th className="px-5 py-4">Fecha</th>
              <th>Descripción</th>
              <th>Tipo</th>
              <th>Ubicación</th>
              <th>Monto</th>
              <th>Notas</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((m) => {
              const incoming = [
                "capitalInjection",
                "sessionClose",
                "positiveAdjustment",
              ].includes(m.type);
              return (
                <tr key={m.id} className="border-t">
                  <td className="px-5 py-4">{date(m.movementDate)}</td>
                  <td className="font-black">{m.description}</td>
                  <td>
                    {label(financialTypes, m.type)}
                    {m.expenseType && (
                      <p className="text-xs text-slate-400">
                        {label(expenseTypes, m.expenseType)}
                      </p>
                    )}
                  </td>
                  <td>
                    {m.moneyLocation === "cashDeposit"
                      ? "Efectivo"
                      : "Cuenta bancaria"}
                  </td>
                  <td
                    className={`font-black ${incoming ? "text-emerald-700" : "text-red-600"}`}
                  >
                    {incoming ? "+" : "−"}
                    {money(Math.abs(m.amountCents))}
                  </td>
                  <td>{m.notes || "—"}</td>
                  <td>
                    {!m.relatedEntityType && !m.relatedEntityId ? (
                      <button
                        onClick={() => open(m)}
                        className="p-2 text-emerald-700"
                      >
                        <Pencil size={17} />
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-slate-400">
                        Automático
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!items.length && <Empty text="No hay movimientos financieros." />}
      </div>
      {editing !== undefined && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/45 p-4">
          <FormProvider {...methods}>
            <form
              onSubmit={methods.handleSubmit(submit)}
              className="mx-auto my-10 max-w-xl rounded-3xl bg-white p-7"
            >
              <div className="flex justify-between">
                <h2 className="text-2xl font-black">
                  {editing ? "Editar movimiento" : "Nuevo movimiento"}
                </h2>
                <button type="button" onClick={() => setEditing(undefined)}>
                  <X />
                </button>
              </div>
              <div className="mt-6 grid gap-4">
                <FieldSelect
                  label="Tipo"
                  options={financialTypes.map(([value, label]) => ({
                    value,
                    label,
                  }))}
                  register={methods.register("type", {
                    required: "Selecciona el tipo",
                  })}
                />
                {methods.watch("type") === "operatingExpense" && (
                  <FieldSelect
                    label="Tipo de gasto"
                    options={expenseTypes.map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    register={methods.register("expenseType")}
                  />
                )}
                <FieldSelect
                  label="Ubicación del dinero"
                  options={[
                    { value: "cashDeposit", label: "Efectivo" },
                    { value: "bankAccount", label: "Cuenta bancaria" },
                  ]}
                  register={methods.register("moneyLocation")}
                />
                <FieldInput
                  label="Monto"
                  type="number"
                  step="0.01"
                  register={methods.register("amount", {
                    valueAsNumber: true,
                    required: "El monto es obligatorio",
                  })}
                  error={methods.formState.errors.amount}
                />
                <FieldInput
                  label="Descripción"
                  register={methods.register("description", {
                    required: "La descripción es obligatoria",
                  })}
                  error={methods.formState.errors.description}
                />
                <FieldDateTimePicker
                  label="Fecha"
                  register={methods.register("movementDate", {
                    required: "La fecha es obligatoria",
                  })}
                />
                <FieldTextarea
                  label="Notas"
                  register={methods.register("notes")}
                />
              </div>
              {error && (
                <p className="mt-4 text-sm font-bold text-red-600">{error}</p>
              )}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(undefined)}
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
