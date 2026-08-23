import { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CloudUpload,
  CreditCard,
  EllipsisVertical,
  Lock,
  LogOut,
  Minus,
  Plus,
  Receipt,
  Search,
  Shield,
  ShoppingCart,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, isConnectionError } from "../api";
import { useAuth } from "../auth";
import { FieldInput, FieldSelect, FieldTextarea } from "../components/fields";
import { Spinner } from "../components/Spinner";
import { AppVersion } from "../components/AppVersion";
import { UserMenuHeader } from "../components/UserMenuHeader";
import { offlineLimitMs, posOffline, type PendingSale } from "../posOffline";
import { playSaleSound, prepareSaleSound } from "../utils/audio";
type State = Awaited<ReturnType<typeof api.posState>>;
type Product = State["products"][number];
type Order = Awaited<ReturnType<typeof api.posOrders>>["orders"][number];
const money = (c: number) =>
  new Intl.NumberFormat("es", { style: "currency", currency: "CUP" }).format(
    c / 100,
  );
const offlineAvailableUntil = (state: State, syncedAt: number) => {
  const authorizedUntil = Date.parse(
    state.session?.offlineAuthorizedUntil ?? "",
  );
  return Number.isFinite(authorizedUntil)
    ? authorizedUntil
    : syncedAt + offlineLimitMs;
};
export function PosPage() {
  const navigate = useNavigate(),
    { user, setUser } = useAuth(),
    [data, setData] = useState<State | null>(null),
    [search, setSearch] = useState(""),
    [selectedCategoryId, setSelectedCategoryId] = useState("all"),
    [cart, setCart] = useState<Record<string, number>>({}),
    [payment, setPayment] = useState<"cash" | "card">("cash"),
    [cashReceived, setCashReceived] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [closing, setClosing] = useState(false),
    [ordersOpen, setOrdersOpen] = useState(false),
    [orders, setOrders] = useState<Order[]>([]),
    [refunding, setRefunding] = useState<Order | null>(null),
    [online, setOnline] = useState(navigator.onLine),
    [pendingSales, setPendingSales] = useState<PendingSale[]>([]),
    [lastSync, setLastSync] = useState(0),
    [syncing, setSyncing] = useState(false),
    [selling, setSelling] = useState(false),
    [mobileView, setMobileView] = useState<"products" | "cart">("products"),
    [mobileMenuOpen, setMobileMenuOpen] = useState(false),
    [clock, setClock] = useState(Date.now());
  const syncingRef = useRef(false);
  const openForm = useForm<{ locationId: string; amount: number }>({
      defaultValues: { locationId: "", amount: 0 },
    }),
    closeForm = useForm<{ amount: number }>({ defaultValues: { amount: 0 } }),
    refundForm = useForm<{ notes: string }>({ defaultValues: { notes: "" } });
  const countedCashCents = Math.round(
    Number(closeForm.watch("amount") || 0) * 100,
  );
  async function load() {
    try {
      const state = await api.posState();
      setData(state);
      setOnline(true);
      setLastSync(Date.now());
      await posOffline.saveSnapshot(state);
    } catch (reason) {
      if (!isConnectionError(reason)) {
        setError(
          reason instanceof Error ? reason.message : "No se pudo cargar el POS",
        );
        setPendingSales(await posOffline.sales());
        return;
      }
      const snapshot = await posOffline.snapshot();
      setOnline(false);
      if (
        snapshot?.state.session &&
        Date.now() <= offlineAvailableUntil(snapshot.state, snapshot.syncedAt)
      ) {
        setData(snapshot.state);
        setLastSync(snapshot.syncedAt);
      } else
        setError(
          reason instanceof Error
            ? `${reason.message}. El período offline disponible expiró.`
            : "No se pudo cargar el POS",
        );
    }
    setPendingSales(await posOffline.sales());
  }
  async function syncPending() {
    if (!navigator.onLine || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    const queued = await posOffline.sales();
    const snapshot = await posOffline.snapshot();
    let connectionAvailable = true;
    for (const sale of queued) {
      try {
        const cashSessionId = sale.cashSessionId ?? snapshot?.state.session?.id;
        if (!cashSessionId)
          throw new Error("No se encontró la sesión original de la venta");
        await api.createPosSale({
          cashSessionId,
          operationId: sale.operationId,
          createdAt: sale.createdAt,
          expectedTotalCents: sale.expectedTotalCents,
          paymentMethod: sale.paymentMethod,
          items: sale.items,
        });
        await posOffline.removeSale(sale.operationId);
      } catch (reason) {
        if (isConnectionError(reason)) {
          connectionAvailable = false;
          setOnline(false);
          break;
        }
        await posOffline.putSale({
          ...sale,
          status: "conflict",
          error:
            reason instanceof Error
              ? reason.message
              : "Conflicto de sincronización",
        });
        break;
      }
    }
    setPendingSales(await posOffline.sales());
    syncingRef.current = false;
    setSyncing(false);
    if (connectionAvailable) await load();
  }
  useEffect(() => {
    void (async () => {
      if (navigator.onLine) await syncPending();
      else await load();
    })();
    const handleOnline = () => {
      setOnline(true);
      void syncPending();
    };
    const handleOffline = () => setOnline(false);
    const retry = window.setInterval(
      () => {
        if (navigator.onLine) void syncPending();
      },
      5 * 60 * 1000,
    );
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void syncPending();
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(retry);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(""), 3_500);
    return () => window.clearTimeout(timer);
  }, [success]);
  const products = useMemo(
    () =>
      data?.products.filter(
        (product) =>
          (selectedCategoryId === "all" ||
            product.categoryId === selectedCategoryId) &&
          product.name.toLowerCase().includes(search.toLowerCase()),
      ) ?? [],
    [data, search, selectedCategoryId],
  );
  const availableCategories = useMemo(
    () =>
      (data?.categories ?? []).filter((category) =>
        data?.products.some(
          (product) =>
            product.categoryId === category.id && Number(product.stock) > 0,
        ),
      ),
    [data],
  );
  useEffect(() => {
    if (
      selectedCategoryId !== "all" &&
      !availableCategories.some(
        (category) => category.id === selectedCategoryId,
      )
    )
      setSelectedCategoryId("all");
  }, [availableCategories, selectedCategoryId]);
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
  const cashReceivedCents = Math.round(Number(cashReceived || 0) * 100);
  const cashIsEnough = cashReceived !== "" && cashReceivedCents >= total;
  const changeDueCents = Math.max(0, cashReceivedCents - total);
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
  function clearOrder() {
    setCart({});
    setCashReceived("");
    setMobileView("products");
  }
  async function saveOfflineSale(
    saleInput: Omit<PendingSale, "status" | "error">,
    soundReady: Promise<void>,
  ) {
    if (Date.now() > offlineAvailableUntil(data!, lastSync))
      throw new Error("El período offline de 12 horas expiró");
    await posOffline.putSale({ ...saleInput, status: "pending" });
    const nextState = {
      ...data!,
      session: data!.session
        ? {
            ...data!.session,
            totalOrders: data!.session.totalOrders + 1,
            totalItems:
              data!.session.totalItems +
              saleInput.items.reduce((sum, item) => sum + item.quantity, 0),
            cashOrders:
              data!.session.cashOrders +
              (saleInput.paymentMethod === "cash" ? 1 : 0),
            cardOrders:
              data!.session.cardOrders +
              (saleInput.paymentMethod === "card" ? 1 : 0),
            cashSalesCents:
              data!.session.cashSalesCents +
              (saleInput.paymentMethod === "cash"
                ? saleInput.expectedTotalCents
                : 0),
            cardSalesCents:
              data!.session.cardSalesCents +
              (saleInput.paymentMethod === "card"
                ? saleInput.expectedTotalCents
                : 0),
            expectedCashAmountCents:
              data!.session.expectedCashAmountCents +
              (saleInput.paymentMethod === "cash"
                ? saleInput.expectedTotalCents
                : 0),
          }
        : null,
      products: data!.products.map((product) => ({
        ...product,
        stock:
          product.stock -
          (saleInput.items.find((item) => item.productId === product.id)
            ?.quantity ?? 0),
      })),
    };
    setData(nextState);
    await posOffline.saveSnapshot(nextState, lastSync);
    setPendingSales(await posOffline.sales());
    setCart({});
    setCashReceived("");
    setMobileView("products");
    await soundReady;
    playSaleSound();
    setSuccess("Venta guardada sin conexión. Se sincronizará automáticamente.");
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
    if (selling) return;
    setSelling(true);
    setError("");
    setSuccess("");
    const soundReady = prepareSaleSound();
    try {
      const operationId = crypto.randomUUID();
      const saleInput = {
        cashSessionId: data!.session!.id,
        operationId,
        createdAt: new Date().toISOString(),
        expectedTotalCents: total,
        paymentMethod: payment,
        items: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
        })),
      };
      if (!online) {
        await saveOfflineSale(saleInput, soundReady);
        return;
      }
      let result: Awaited<ReturnType<typeof api.createPosSale>>;
      try {
        result = await api.createPosSale(saleInput);
      } catch (reason) {
        if (!isConnectionError(reason)) throw reason;
        setOnline(false);
        await saveOfflineSale(saleInput, soundReady);
        return;
      }
      setCart({});
      setCashReceived("");
      setMobileView("products");
      await soundReady;
      playSaleSound();
      setSuccess(`Venta registrada por ${money(result.totalCents)}`);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo registrar la venta",
      );
    } finally {
      setSelling(false);
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
    setMobileMenuOpen(false);
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
  async function logout() {
    setMobileMenuOpen(false);
    await api.logout();
    setUser(null);
    navigate("/");
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
      <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b bg-white px-3 py-2 sm:min-h-20 sm:gap-3 sm:px-7 sm:py-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base font-black sm:text-xl">Kontia POS</h1>
            <div className="flex flex-wrap items-center gap-x-2">
              <p className="text-xs font-bold text-slate-400">
                {data.session?.locationName ?? "Selecciona un punto de venta"}
              </p>
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center justify-end gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-xl p-2 text-xs font-black sm:px-3 ${online ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
            title={online ? "En línea" : "Sin conexión"}
            aria-label={online ? "En línea" : "Sin conexión"}
          >
            {online ? <Wifi size={15} /> : <WifiOff size={15} />}
            <span className="hidden sm:inline">
              {syncing
                ? "Sincronizando…"
                : online
                  ? "En línea"
                  : `${Math.max(0, Math.ceil((offlineAvailableUntil(data, lastSync) - clock) / 60000))} min offline`}
            </span>
          </span>
          {pendingSales.length > 0 && (
            <button
              type="button"
              disabled={!online || syncing}
              onClick={() => void syncPending()}
              className="relative flex items-center gap-1 rounded-xl bg-amber-50 px-2.5 py-2 text-xs font-black text-amber-800 disabled:opacity-60 sm:hidden"
              title={`${pendingSales.length} ${pendingSales.length === 1 ? "orden pendiente" : "órdenes pendientes"} por sincronizar`}
              aria-label={`${pendingSales.length} ${pendingSales.length === 1 ? "orden pendiente" : "órdenes pendientes"} por sincronizar`}
            >
              <CloudUpload size={16} />
              <span>{pendingSales.length}</span>
            </button>
          )}
          <button
            type="button"
            disabled={!online || syncing || pendingSales.length === 0}
            onClick={() => void syncPending()}
            className={`hidden rounded-xl px-3 py-2 text-xs font-black sm:block ${pendingSales.length ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"} disabled:opacity-70`}
          >
            {pendingSales.length} pendiente
            {pendingSales.length === 1 ? "" : "s"}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="rounded-xl border border-slate-200 p-2"
              aria-label="Abrir menú del POS"
              aria-expanded={mobileMenuOpen}
            >
              <EllipsisVertical size={20} />
            </button>
            {mobileMenuOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-30 cursor-default"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Cerrar menú"
                />
                <div className="absolute right-0 top-12 z-40 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  <UserMenuHeader displayName={user?.displayName} />
                  <div className="my-1 border-t" />
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      navigate("/admin");
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold hover:bg-slate-50"
                  >
                    <Shield size={17} /> Administración
                  </button>
                  {pendingSales.length > 0 && (
                    <button
                      type="button"
                      disabled={!online || syncing}
                      onClick={() => void syncPending()}
                      className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-bold text-blue-700 disabled:opacity-50"
                    >
                      Sincronizar ({pendingSales.length})
                    </button>
                  )}
                  {data.session && (
                    <>
                      <button
                        type="button"
                        disabled={!online}
                        onClick={() => void openOrders()}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold hover:bg-slate-50 disabled:opacity-40"
                      >
                        <Receipt size={17} /> Órdenes
                      </button>
                      <button
                        type="button"
                        disabled={!online || pendingSales.length > 0}
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setClosing(true);
                          closeForm.reset({
                            amount: data.session?.expectedCashAmountCents
                              ? data.session.expectedCashAmountCents / 100
                              : 0,
                          });
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-40"
                      >
                        <Lock size={17} /> Cerrar caja
                      </button>
                    </>
                  )}
                  <div className="my-1 border-t" />
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold hover:bg-slate-50"
                  >
                    <LogOut size={17} /> Cerrar sesión
                  </button>
                  <div className="my-1 border-t" />
                  <div className="px-3 py-2 text-slate-500">
                    <AppVersion />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      {pendingSales.some((sale) => sale.status === "conflict") && (
        <div className="bg-red-50 px-4 py-2 text-sm font-bold text-red-700">
          No se pudo sincronizar una venta:{" "}
          {pendingSales.find((sale) => sale.status === "conflict")?.error}.
          Revisa la conexión o los datos y vuelve a intentar.
        </div>
      )}
      {success && (
        <div className="fixed right-4 top-24 z-[90] flex max-w-sm items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 text-emerald-800 shadow-xl">
          <CheckCircle2 className="mt-0.5 shrink-0" size={21} />
          <p className="flex-1 text-sm font-black">{success}</p>
          <button
            type="button"
            onClick={() => setSuccess("")}
            className="text-emerald-700/60 hover:text-emerald-900"
            aria-label="Cerrar notificación"
          >
            <X size={17} />
          </button>
        </div>
      )}
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
                  disabled={!online || !data.locations.length}
                  className="mt-5 w-full rounded-2xl bg-emerald-700 py-3 font-black text-white disabled:opacity-40"
                >
                  Abrir caja
                </button>
              </form>
            </FormProvider>
          </div>
        </section>
      ) : (
        <div className="grid min-h-[calc(100vh-64px)] lg:min-h-[calc(100vh-80px)] lg:grid-cols-[1fr_390px]">
          <section
            className={`${mobileView === "cart" ? "hidden" : "block"} p-3 pb-24 sm:block sm:p-6 sm:pb-6`}
          >
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-white px-4 shadow-sm">
                <Search className="shrink-0 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar producto"
                  className="w-full py-3.5 outline-none"
                />
              </div>
              <div className="flex max-w-full gap-2 overflow-x-auto pb-1 xl:max-w-[58%]">
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId("all")}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-black ${selectedCategoryId === "all" ? "bg-emerald-700 text-white" : "bg-white text-slate-600 shadow-sm"}`}
                >
                  <span className="text-xl">✨</span> Todas
                </button>
                {availableCategories.map((category) => (
                  <button
                    type="button"
                    key={category.id}
                    title={category.name}
                    onClick={() =>
                      setSelectedCategoryId((current) =>
                        current === category.id ? "all" : category.id,
                      )
                    }
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-black ${selectedCategoryId === category.id ? "bg-emerald-700 text-white" : "bg-white text-slate-600 shadow-sm"}`}
                  >
                    <span className="text-2xl">{category.icon || "🛒"}</span>
                    <span>{category.name}</span>
                  </button>
                ))}
              </div>
            </div>
            {error && (
              <p className="mt-4 rounded-2xl bg-red-50 p-3 font-bold text-red-700">
                {error}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-5 sm:gap-3 md:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
                <button
                  key={product.id}
                  disabled={Number(product.stock) <= 0}
                  onClick={() => change(product, 1)}
                  className="relative touch-manipulation select-none overflow-hidden rounded-2xl bg-white text-left shadow-sm transition duration-100 [-webkit-tap-highlight-color:transparent] hover:-translate-y-0.5 hover:shadow-md active:scale-[0.94] active:ring-4 active:ring-emerald-500/30 disabled:opacity-50 disabled:active:scale-100 disabled:active:ring-0 sm:rounded-3xl"
                >
                  {Number(cart[product.id] ?? 0) > 0 && (
                    <span className="absolute right-2 top-2 z-10 grid min-h-8 min-w-8 place-items-center rounded-full bg-emerald-600 px-2 text-sm font-black text-white shadow-lg ring-2 ring-white">
                      {cart[product.id]}
                    </span>
                  )}
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
                  <div className="p-2.5 sm:p-3">
                    <p className="line-clamp-2 text-sm font-black sm:text-base">
                      {product.name}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[10px] font-bold text-slate-400 sm:text-xs">
                      {product.categoryName ?? "Sin categoría"} ·{" "}
                      {product.stock} disponibles
                    </p>
                    <p className="mt-2 text-sm font-black text-emerald-700 sm:mt-3 sm:text-base">
                      {money(
                        payment === "cash"
                          ? product.cashPriceCents
                          : product.cardPriceCents,
                      )}
                    </p>
                  </div>
                </button>
              ))}
              {!products.length && (
                <div className="col-span-full rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center font-bold text-slate-400">
                  No se encontraron productos en esta categoría.
                </div>
              )}
            </div>
          </section>
          <aside
            className={`${mobileView === "cart" ? "block" : "hidden"} min-h-[calc(100vh-64px)] bg-white p-4 sm:p-5 lg:sticky lg:top-20 lg:block lg:h-[calc(100vh-5rem)] lg:min-h-0 lg:self-start lg:overflow-y-auto lg:border-l`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMobileView("products")}
                  className="rounded-xl bg-slate-100 p-2 lg:hidden"
                  aria-label="Volver a productos"
                >
                  <ArrowLeft size={20} />
                </button>
                <h2 className="text-xl font-black">Detalle de la orden</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-black text-emerald-700">
                  {lines.reduce((s, l) => s + l.quantity, 0)}
                </span>
                {lines.length > 0 && (
                  <button
                    type="button"
                    onClick={clearOrder}
                    className="rounded-xl bg-red-50 p-2 text-red-600 hover:bg-red-100 hover:text-red-700"
                    aria-label="Eliminar toda la orden"
                    title="Eliminar toda la orden"
                  >
                    <Trash2 size={19} />
                  </button>
                )}
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {lines.map((line) => (
                <div key={line.product.id} className="rounded-2xl border p-3">
                  <div className="flex justify-between gap-3">
                    <p className="font-black">{line.product.name}</p>
                    <button
                      onClick={() => change(line.product, -line.quantity)}
                      className="rounded-lg p-1 text-red-600 hover:bg-red-50 hover:text-red-700"
                      aria-label={`Eliminar ${line.product.name} de la orden`}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => change(line.product, -1)}
                        className="rounded-lg bg-red-50 p-1 text-red-700 hover:bg-red-100"
                        aria-label={`Reducir cantidad de ${line.product.name}`}
                      >
                        <Minus size={16} />
                      </button>
                      <b>{line.quantity}</b>
                      <button
                        onClick={() => change(line.product, 1)}
                        className="rounded-lg bg-emerald-50 p-1 text-emerald-700 hover:bg-emerald-100"
                        aria-label={`Aumentar cantidad de ${line.product.name}`}
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
              {payment === "cash" && (
                <div className="mt-4 rounded-2xl bg-slate-100 p-4">
                  <label
                    htmlFor="cash-received"
                    className="text-sm font-black text-slate-600"
                  >
                    Efectivo recibido
                  </label>
                  <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-white px-3 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/15">
                    <span className="font-black text-slate-400">$</span>
                    <input
                      id="cash-received"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={cashReceived}
                      onChange={(event) => setCashReceived(event.target.value)}
                      placeholder="0.00"
                      className="min-w-0 flex-1 bg-transparent px-2 py-3 text-right text-xl font-black outline-none"
                    />
                  </div>
                  {cashReceived !== "" && (
                    <div
                      className={`mt-3 flex items-center justify-between font-black ${cashIsEnough ? "text-emerald-700" : "text-red-600"}`}
                    >
                      <span>{cashIsEnough ? "Vuelto" : "Faltan"}</span>
                      <span className="text-2xl">
                        {money(
                          cashIsEnough
                            ? changeDueCents
                            : Math.max(0, total - cashReceivedCents),
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}
              <button
                disabled={!lines.length || selling}
                onClick={() => void sell()}
                className="mt-5 w-full rounded-2xl bg-emerald-700 py-3 font-black text-white disabled:opacity-40"
              >
                {selling ? (
                  <span className="flex justify-center">
                    <Spinner label="Procesando…" size="sm" tone="light" />
                  </span>
                ) : (
                  "Cobrar"
                )}
              </button>
            </div>
          </aside>
          {mobileView === "products" && lines.length > 0 && (
            <div className="fixed bottom-4 left-4 right-4 z-20 flex items-center rounded-2xl bg-emerald-700 p-1.5 shadow-xl shadow-emerald-950/20 lg:hidden">
              <button
                type="button"
                onClick={() => setMobileView("cart")}
                className="flex min-w-0 flex-1 items-center justify-between px-2.5 py-2.5 font-black text-white"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ShoppingCart className="shrink-0" size={20} />
                  <span className="truncate">
                    Ver orden ({lines.reduce((s, l) => s + l.quantity, 0)})
                  </span>
                </span>
                <span className="ml-2 shrink-0">{money(total)}</span>
              </button>
              <button
                type="button"
                onClick={clearOrder}
                className="ml-1 grid min-w-11 place-items-center rounded-xl bg-red-50 p-2.5 text-red-600 active:bg-red-100"
                aria-label="Eliminar toda la orden"
              >
                <Trash2 size={21} />
              </button>
            </div>
          )}
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
                          disabled={!online}
                          onClick={() => {
                            refundForm.reset({ notes: "" });
                            setRefunding(order);
                          }}
                          className="rounded-xl bg-red-50 px-3 py-2 text-sm font-black text-red-700 disabled:opacity-40"
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
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 sm:items-center sm:p-4">
          <FormProvider {...refundForm}>
            <form
              onSubmit={refundForm.handleSubmit(refund)}
              className="my-2 w-full max-w-2xl rounded-3xl bg-white p-4 sm:my-4 sm:p-7"
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
              <div className="mt-6 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end sm:gap-3 sm:border-0 sm:pt-0">
                <button
                  type="button"
                  onClick={() => setRefunding(null)}
                  className="w-full rounded-xl px-3 py-2.5 font-black text-slate-500 sm:w-auto"
                >
                  Cancelar
                </button>
                <button className="w-full rounded-xl bg-red-700 px-4 py-2.5 font-black text-white sm:w-auto sm:px-5">
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
