import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  Lock,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { FieldInput, FieldSelect, FieldTextarea } from "../components/fields";
type State = Awaited<ReturnType<typeof api.posState>>;
type Product = State["products"][number];
type Order = Awaited<ReturnType<typeof api.posOrders>>["orders"][number];
const money = (c: number) =>
  new Intl.NumberFormat("es", { style: "currency", currency: "CUP" }).format(
    c / 100,
  );
export function PosPage() {
  const navigate = useNavigate(),
    [data, setData] = useState<State | null>(null),
    [search, setSearch] = useState(""),
    [cart, setCart] = useState<Record<string, number>>({}),
    [payment, setPayment] = useState<"cash" | "card">("cash"),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [closing, setClosing] = useState(false),
    [ordersOpen, setOrdersOpen] = useState(false),
    [orders, setOrders] = useState<Order[]>([]),
    [refunding, setRefunding] = useState<Order | null>(null);
  const openForm = useForm<{ locationId: string; amount: number }>({
      defaultValues: { locationId: "", amount: 0 },
    }),
    closeForm = useForm<{ amount: number }>({ defaultValues: { amount: 0 } }),
    refundForm = useForm<{ notes: string }>({ defaultValues: { notes: "" } });
  const countedCashCents = Math.round(
    Number(closeForm.watch("amount") || 0) * 100,
  );
  const load = () =>
    api
      .posState()
      .then(setData)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudo cargar el POS"),
      );
  useEffect(() => {
    void load();
  }, []);
  const products = useMemo(
    () =>
      data?.products.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()),
      ) ?? [],
    [data, search],
  );
  const lines = Object.entries(cart)
    .map(([id, quantity]) => ({
      product: data?.products.find((p) => p.id === id),
      quantity,
    }))
    .filter((line): line is { product: Product; quantity: number } =>
      Boolean(line.product),
    );
  const total = lines.reduce(
    (sum, line) =>
      sum +
      (payment === "cash"
        ? line.product.cashPriceCents
        : line.product.cardPriceCents) *
        line.quantity,
    0,
  );
  function change(product: Product, delta: number) {
    setCart((current) => {
      const next = Math.max(
          0,
          Math.min(
            Number(product.stock),
            Number(current[product.id] ?? 0) + delta,
          ),
        ),
        copy = { ...current };
      if (next) copy[product.id] = next;
      else delete copy[product.id];
      return copy;
    });
  }
  async function open(values: { locationId: string; amount: number }) {
    setError("");
    try {
      await api.openPosSession(
        values.locationId,
        Math.round(values.amount * 100),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la caja");
    }
  }
  async function sell() {
    setError("");
    setSuccess("");
    try {
      const result = await api.createPosSale({
        paymentMethod: payment,
        items: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
        })),
      });
      setCart({});
      setSuccess(`Venta registrada por ${money(result.totalCents)}`);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo registrar la venta",
      );
    }
  }
  async function close(values: { amount: number }) {
    setError("");
    try {
      const result = await api.closePosSession(Math.round(values.amount * 100));
      setClosing(false);
      setCart({});
      setSuccess(`Caja cerrada. Diferencia: ${money(result.differenceCents)}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar la caja");
    }
  }
  async function openOrders() {
    setError("");
    try {
      const result = await api.posOrders();
      setOrders(result.orders);
      setOrdersOpen(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudieron cargar las órdenes",
      );
    }
  }
  async function refund(values: { notes: string }) {
    if (!refunding) return;
    setError("");
    try {
      await api.refundPosOrder(refunding.id, values.notes || undefined);
      setRefunding(null);
      refundForm.reset();
      const result = await api.posOrders();
      setOrders(result.orders);
      setSuccess("Reintegro registrado correctamente");
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo registrar el reintegro",
      );
    }
  }
  if (!data)
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100">
        <p className="font-black text-emerald-800">Cargando POS…</p>
        {error && <p className="text-red-600">{error}</p>}
      </main>
    );
  return (
    <main className="min-h-screen bg-[#f3f5f2] text-slate-900">
      <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b bg-white px-4 sm:px-7">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/admin")}
            className="rounded-xl p-2 hover:bg-slate-100"
          >
            <ArrowLeft />
          </button>
          <div>
            <h1 className="text-xl font-black">Kontia POS</h1>
            <p className="text-xs font-bold text-slate-400">
              {data.session?.locationName ?? "Selecciona un punto de venta"}
            </p>
          </div>
        </div>
        {data.session && (
          <div className="flex gap-2">
            <button
              onClick={() => void openOrders()}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black"
            >
              Órdenes
            </button>
            <button
              onClick={() => {
                setClosing(true);
                closeForm.reset({
                  amount: data.session?.expectedCashAmountCents
                    ? data.session.expectedCashAmountCents / 100
                    : 0,
                });
              }}
              className="rounded-xl border border-red-200 px-4 py-2 text-sm font-black text-red-700"
            >
              Cerrar caja
            </button>
          </div>
        )}
      </header>
      {!data.session ? (
        <section className="mx-auto grid min-h-[calc(100vh-80px)] max-w-lg content-center p-5">
          <div className="rounded-3xl bg-white p-8 shadow-sm">
            <p className="text-sm font-black uppercase text-emerald-700">
              Punto de venta
            </p>
            <h2 className="mt-2 text-3xl font-black">
              Abre la caja para comenzar
            </h2>
            <p className="mt-2 text-slate-500">
              Indica el efectivo inicial disponible.
            </p>
            <FormProvider {...openForm}>
              <form onSubmit={openForm.handleSubmit(open)} className="mt-6">
                <FieldSelect
                  label="Punto de venta"
                  placeholder="Seleccionar ubicación POS"
                  options={data.locations.map((location) => ({
                    value: location.id,
                    label: location.name,
                  }))}
                  register={openForm.register("locationId", {
                    required: "Selecciona un punto de venta",
                  })}
                  error={openForm.formState.errors.locationId}
                />
                {!data.locations.length && (
                  <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">
                    Crea primero una ubicación de tipo Punto de venta.
                  </p>
                )}
                <div className="mt-4">
                  <FieldInput
                    label="Monto inicial"
                    type="number"
                    min="0"
                    step="0.01"
                    register={openForm.register("amount", {
                      valueAsNumber: true,
                      required: "Indica el monto",
                      min: { value: 0, message: "No puede ser negativo" },
                    })}
                    error={openForm.formState.errors.amount}
                  />
                </div>
                {error && (
                  <p className="mt-3 text-sm font-bold text-red-600">{error}</p>
                )}
                <button
                  disabled={!data.locations.length}
                  className="mt-5 w-full rounded-2xl bg-emerald-700 py-3 font-black text-white disabled:opacity-40"
                >
                  Abrir caja
                </button>
              </form>
            </FormProvider>
          </div>
        </section>
      ) : (
        <div className="grid min-h-[calc(100vh-80px)] lg:grid-cols-[1fr_390px]">
          <section className="p-4 sm:p-6">
            <div className="flex items-center gap-3 rounded-2xl bg-white px-4 shadow-sm">
              <Search className="text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto"
                className="w-full py-3.5 outline-none"
              />
            </div>
            {success && (
              <p className="mt-4 rounded-2xl bg-emerald-50 p-3 font-bold text-emerald-700">
                {success}
              </p>
            )}
            {error && (
              <p className="mt-4 rounded-2xl bg-red-50 p-3 font-bold text-red-700">
                {error}
              </p>
            )}
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <button
                  key={product.id}
                  disabled={Number(product.stock) <= 0}
                  onClick={() => change(product, 1)}
                  className="overflow-hidden rounded-3xl bg-white text-left shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50"
                >
                  <div className="aspect-[16/9] bg-slate-100">
                    {product.imageId ? (
                      <img
                        src={`/media/${product.imageId}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-slate-300">
                        <ShoppingCart size={36} />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="font-black">{product.name}</p>
                    <p className="text-xs font-bold text-slate-400">
                      {product.categoryName ?? "Sin categoría"} ·{" "}
                      {product.stock} disponibles
                    </p>
                    <p className="mt-3 font-black text-emerald-700">
                      {money(
                        payment === "cash"
                          ? product.cashPriceCents
                          : product.cardPriceCents,
                      )}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
          <aside className="border-l bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">Carrito</h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-black text-emerald-700">
                {lines.reduce((s, l) => s + l.quantity, 0)}
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {lines.map((line) => (
                <div key={line.product.id} className="rounded-2xl border p-3">
                  <div className="flex justify-between gap-3">
                    <p className="font-black">{line.product.name}</p>
                    <button
                      onClick={() => change(line.product, -line.quantity)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => change(line.product, -1)}
                        className="rounded-lg bg-slate-100 p-1"
                      >
                        <Minus size={16} />
                      </button>
                      <b>{line.quantity}</b>
                      <button
                        onClick={() => change(line.product, 1)}
                        className="rounded-lg bg-slate-100 p-1"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <b>
                      {money(
                        (payment === "cash"
                          ? line.product.cashPriceCents
                          : line.product.cardPriceCents) * line.quantity,
                      )}
                    </b>
                  </div>
                </div>
              ))}
              {!lines.length && (
                <p className="py-12 text-center font-bold text-slate-400">
                  Agrega productos para vender.
                </p>
              )}
            </div>
            <div className="mt-6 border-t pt-5">
              <p className="text-sm font-black text-slate-500">
                Método de pago
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPayment("cash")}
                  className={`rounded-xl p-3 font-black ${payment === "cash" ? "bg-emerald-700 text-white" : "bg-slate-100"}`}
                >
                  Efectivo
                </button>
                <button
                  onClick={() => setPayment("card")}
                  className={`rounded-xl p-3 font-black ${payment === "card" ? "bg-emerald-700 text-white" : "bg-slate-100"}`}
                >
                  Tarjeta
                </button>
              </div>
              <div className="mt-5 flex justify-between text-2xl font-black">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
              <button
                disabled={!lines.length}
                onClick={() => void sell()}
                className="mt-5 w-full rounded-2xl bg-emerald-700 py-3 font-black text-white disabled:opacity-40"
              >
                Cobrar
              </button>
            </div>
          </aside>
        </div>
      )}
      {closing && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/45 p-4">
          <FormProvider {...closeForm}>
            <form
              onSubmit={closeForm.handleSubmit(close)}
              className="mx-auto my-6 w-full max-w-4xl rounded-3xl bg-white p-7"
            >
              <div className="flex justify-between">
                <h2 className="text-2xl font-black">Cerrar caja</h2>
                <button type="button" onClick={() => setClosing(false)}>
                  <X />
                </button>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Revisa el resumen de la sesión antes de cerrar la caja.
              </p>
              {data.session && (
                <>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <SummaryCard
                      label="Apertura"
                      value={new Date(data.session.openedAt).toLocaleString()}
                    />
                    <SummaryCard
                      label="Punto de venta"
                      value={data.session.locationName}
                    />
                    <SummaryCard
                      label="Dinero inicial en caja"
                      value={money(data.session.openingAmountCents)}
                      large
                    />
                    <SummaryCard
                      label="Órdenes totales"
                      value={String(data.session.totalOrders)}
                      detail={`${data.session.totalItems} productos vendidos`}
                      large
                    />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-3xl border p-4">
                      <div className="flex items-center gap-2 font-black text-emerald-700">
                        <Banknote size={20} /> Ventas en efectivo
                      </div>
                      <p className="mt-3 text-3xl font-black">
                        {money(data.session.cashSalesCents)}
                      </p>
                      <p className="text-sm text-slate-500">
                        {data.session.cashOrders} órdenes en efectivo
                      </p>
                      {data.session.cashRefundsCents > 0 && (
                        <p className="mt-1 text-sm font-bold text-red-700">
                          Reintegros: {money(data.session.cashRefundsCents)}
                        </p>
                      )}
                    </div>
                    <div className="rounded-3xl border p-4">
                      <div className="flex items-center gap-2 font-black">
                        <CreditCard size={20} /> Ventas por transferencia
                      </div>
                      <p className="mt-3 text-3xl font-black">
                        {money(data.session.cardSalesCents)}
                      </p>
                      <p className="text-sm text-slate-500">
                        {data.session.cardOrders} órdenes por transferencia
                      </p>
                      {data.session.cardRefundsCents > 0 && (
                        <p className="mt-1 text-sm font-bold text-red-700">
                          Reintegros: {money(data.session.cardRefundsCents)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 rounded-3xl bg-slate-900 p-5 text-white">
                    <p className="text-sm font-bold text-white/60">
                      Efectivo esperado en caja
                    </p>
                    <p className="mt-1 text-4xl font-black">
                      {money(data.session.expectedCashAmountCents)}
                    </p>
                    <p className="mt-2 text-sm text-white/60">
                      Dinero inicial + ventas en efectivo − reintegros. Las
                      transferencias no forman parte del efectivo físico.
                    </p>
                  </div>
                </>
              )}
              <div className="mt-4 rounded-3xl bg-slate-100 p-4">
                <FieldInput
                  label="Efectivo contado"
                  type="number"
                  min="0"
                  step="0.01"
                  register={closeForm.register("amount", {
                    valueAsNumber: true,
                    required: "Indica el efectivo contado",
                    min: { value: 0, message: "No puede ser negativo" },
                  })}
                  error={closeForm.formState.errors.amount}
                />
                {data.session && (
                  <div
                    className={`mt-4 rounded-2xl px-4 py-3 font-black ${countedCashCents - data.session.expectedCashAmountCents === 0 ? "bg-emerald-100 text-emerald-700" : countedCashCents - data.session.expectedCashAmountCents < 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
                  >
                    Diferencia:{" "}
                    {money(
                      countedCashCents - data.session.expectedCashAmountCents,
                    )}
                  </div>
                )}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setClosing(false)}
                  className="font-black text-slate-500"
                >
                  Cancelar
                </button>
                <button className="flex items-center gap-2 rounded-xl bg-red-700 px-5 py-2.5 font-black text-white">
                  <Lock size={17} /> Confirmar cierre de caja
                </button>
              </div>
            </form>
          </FormProvider>
        </div>
      )}
      {ordersOpen && (
        <div className="fixed inset-0 z-[65] overflow-y-auto bg-slate-950/45 p-4">
          <div className="mx-auto my-6 w-full max-w-4xl rounded-3xl bg-white p-7">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-black">Órdenes de la sesión</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Ventas realizadas desde que se abrió esta caja.
                </p>
              </div>
              <button onClick={() => setOrdersOpen(false)}>
                <X />
              </button>
            </div>
            {error && (
              <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">
                {error}
              </p>
            )}
            <div className="mt-5 space-y-3">
              {orders.map((order) => (
                <div key={order.id} className="rounded-2xl border p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="font-black">
                        {new Date(order.createdAt).toLocaleString()}
                      </p>
                      <p className="text-sm text-slate-500">
                        {order.items.length} productos ·{" "}
                        {order.paymentMethod === "cash"
                          ? "Efectivo"
                          : "Transferencia"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <b
                        className={
                          order.refundId ? "text-red-600 line-through" : ""
                        }
                      >
                        {money(order.totalCents)}
                      </b>
                      {order.refundId ? (
                        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">
                          Reintegrada
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            refundForm.reset({ notes: "" });
                            setRefunding(order);
                          }}
                          className="rounded-xl bg-red-50 px-3 py-2 text-sm font-black text-red-700"
                        >
                          Reintegrar
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 border-t pt-3">
                    {order.items.map((item) => (
                      <p key={item.id} className="flex justify-between text-sm">
                        <span>
                          {item.quantity} × {item.productName}
                        </span>
                        <b>{money(item.totalCents)}</b>
                      </p>
                    ))}
                  </div>
                  {order.refundNotes && (
                    <p className="mt-2 text-sm text-red-600">
                      {order.refundNotes}
                    </p>
                  )}
                </div>
              ))}
              {!orders.length && (
                <p className="py-12 text-center font-bold text-slate-400">
                  No hay órdenes en esta sesión.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {refunding && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-4">
          <FormProvider {...refundForm}>
            <form
              onSubmit={refundForm.handleSubmit(refund)}
              className="w-full max-w-2xl rounded-3xl bg-white p-7"
            >
              <div className="flex justify-between">
                <div>
                  <h2 className="text-2xl font-black">
                    Reintegrar venta completa
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Se devolverán todos los productos a sus lotes originales.
                  </p>
                </div>
                <button type="button" onClick={() => setRefunding(null)}>
                  <X />
                </button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <SummaryCard
                  label="Total vendido"
                  value={money(refunding.totalCents)}
                  large
                />
                <SummaryCard
                  label="Productos"
                  value={String(
                    refunding.items.reduce(
                      (sum, item) => sum + item.quantity,
                      0,
                    ),
                  )}
                  large
                />
                <div className="rounded-3xl bg-slate-900 p-4 text-white">
                  <p className="text-sm font-bold text-white/60">A devolver</p>
                  <p className="mt-1 text-2xl font-black">
                    {money(refunding.totalCents)}
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border p-4">
                <p className="text-sm font-black text-slate-500">
                  Forma del reintegro
                </p>
                <p className="mt-1 font-black">
                  {refunding.paymentMethod === "cash"
                    ? "Efectivo"
                    : "Tarjeta / transferencia"}
                </p>
              </div>
              <div className="mt-4 space-y-2">
                {refunding.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between rounded-2xl bg-slate-100 p-3"
                  >
                    <div>
                      <b>{item.productName}</b>
                      <p className="text-sm text-slate-500">
                        {item.quantity} × {money(item.unitPriceCents)}
                      </p>
                    </div>
                    <b>{money(item.totalCents)}</b>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <FieldTextarea
                  label="Notas"
                  rows={3}
                  register={refundForm.register("notes")}
                />
              </div>
              {error && (
                <p className="mt-4 text-sm font-bold text-red-700">{error}</p>
              )}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRefunding(null)}
                  className="font-black text-slate-500"
                >
                  Cancelar
                </button>
                <button className="rounded-xl bg-red-700 px-5 py-2.5 font-black text-white">
                  Confirmar reintegro
                </button>
              </div>
            </form>
          </FormProvider>
        </div>
      )}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  large = false,
}: {
  label: string;
  value: string;
  detail?: string;
  large?: boolean;
}) {
  return (
    <div className="rounded-3xl bg-slate-100 p-4">
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className={`mt-1 font-black ${large ? "text-2xl" : ""}`}>{value}</p>
      {detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}
    </div>
  );
}
