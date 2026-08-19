import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import {
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  Plus,
  Search,
  X,
} from "lucide-react";
import { api } from "../api";
import { FieldInput, FieldSelect, FieldTextarea } from "../components/fields";
import type {
  InventoryBatch,
  InventoryMovement,
  Location,
  Product,
  SupplierInvoice,
} from "../types";

const movementOptions = [
  ["transfer", "Traslado", "Mueve unidades entre dos ubicaciones."],
  [
    "purchase",
    "Entrada por compra",
    "Crea un lote comprado y puede vincularlo a una factura.",
  ],
  ["customerReturn", "Devolución", "Devuelve unidades a una ubicación."],
  [
    "production",
    "Entrada por producción",
    "Produce un producto compuesto y crea un lote.",
  ],
  [
    "inventoryInjection",
    "Inyección de inventario",
    "Agrega inventario aportado sin factura.",
  ],
  ["positiveAdjustment", "Ajuste positivo", "Suma unidades a una ubicación."],
  [
    "internalConsumption",
    "Consumo interno",
    "Registra unidades usadas por el negocio.",
  ],
  ["ownerWithdrawal", "Retiro del dueño", "Retira unidades del almacén."],
  ["waste", "Merma", "Descuenta pérdidas de una ubicación."],
  ["negativeAdjustment", "Ajuste negativo", "Resta unidades de una ubicación."],
  [
    "disassembly",
    "Desarmar combo",
    "Desarma producción y retorna componentes.",
  ],
] as const;
const label = (type: string) =>
  movementOptions.find(([value]) => value === type)?.[1] ?? type;
const money = (cents: number) =>
  new Intl.NumberFormat("es", { style: "currency", currency: "CUP" }).format(
    cents / 100,
  );

export function InventoryAdminPage() {
  const [tab, setTab] = useState<"batches" | "movements">("batches");
  const [batchSearch, setBatchSearch] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  type MovementValues = {
    productId: string;
    batchId: string;
    movementType: string;
    sourceLocationId: string;
    destinationLocationId: string;
    quantity: number;
    unitCost: number;
    cashPrice: number;
    cardPrice: number;
    supplierInvoiceId: string;
    notes: string;
  };
  const methods = useForm<MovementValues>({
    defaultValues: {
      productId: "",
      batchId: "",
      movementType: "transfer",
      sourceLocationId: "",
      destinationLocationId: "",
      quantity: 0,
      unitCost: 0,
      cashPrice: 0,
      cardPrice: 0,
      supplierInvoiceId: "",
      notes: "",
    },
  });
  async function load() {
    const [b, m, p, i, l] = await Promise.all([
      api.inventoryBatches(),
      api.inventoryMovements(),
      api.products(),
      api.supplierInvoices(),
      api.locations(),
    ]);
    setBatches(b.batches);
    setMovements(m.movements);
    setProducts(p.products);
    setInvoices(i.invoices);
    setLocations(l.locations);
  }
  useEffect(() => {
    void load();
  }, []);
  const visibleBatches = useMemo(
    () =>
      batches.filter((b) =>
        `${b.productName} ${b.invoiceNumber ?? ""} ${b.supplierName ?? ""}`
          .toLowerCase()
          .includes(batchSearch.toLowerCase()),
      ),
    [batches, batchSearch],
  );
  const visibleMovements = useMemo(
    () =>
      movements.filter((m) =>
        `${m.productName} ${label(m.movementType)} ${m.sourceLocationName ?? ""} ${m.destinationLocationName ?? ""} ${m.notes ?? ""}`
          .toLowerCase()
          .includes(movementSearch.toLowerCase()),
      ),
    [movements, movementSearch],
  );
  const type = methods.watch("movementType");
  const productId = methods.watch("productId");
  const selectedProduct = products.find((p) => p.id === productId);
  const createsBatch = [
    "purchase",
    "production",
    "inventoryInjection",
  ].includes(type);
  const availableProducts = products.filter(
    (p) =>
      p.isActive &&
      (!["production", "disassembly"].includes(type) || p.type === "composite"),
  );
  const availableBatches = batches.filter(
    (b) =>
      b.productId === productId &&
      (type !== "disassembly" || b.totalQuantity > 0),
  );
  const needsSource = [
    "transfer",
    "internalConsumption",
    "ownerWithdrawal",
    "waste",
    "negativeAdjustment",
    "production",
    "disassembly",
  ].includes(type);
  const needsDestination = [
    "transfer",
    "purchase",
    "customerReturn",
    "production",
    "inventoryInjection",
    "positiveAdjustment",
    "disassembly",
  ].includes(type);
  const activeLocations = locations.filter((location) => location.isActive);

  async function submit(values: MovementValues) {
    setError("");
    try {
      await api.createInventoryMovement({
        productId: values.productId,
        movementType: values.movementType,
        batchId: createsBatch ? undefined : values.batchId,
        quantity: values.quantity,
        sourceLocationId: needsSource ? values.sourceLocationId : undefined,
        destinationLocationId: needsDestination
          ? values.destinationLocationId
          : undefined,
        unitCostCents: createsBatch
          ? Math.round(values.unitCost * 100)
          : undefined,
        cashPriceCents: createsBatch
          ? Math.round(values.cashPrice * 100)
          : undefined,
        cardPriceCents: createsBatch
          ? Math.round(values.cardPrice * 100)
          : undefined,
        supplierInvoiceId:
          type === "purchase"
            ? values.supplierInvoiceId || undefined
            : undefined,
        notes: values.notes,
      });
      setOpen(false);
      setTab("movements");
      methods.reset();
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo registrar el movimiento",
      );
    }
  }

  return (
    <section>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-emerald-700">
            Operaciones
          </p>
          <h1 className="mt-1 text-3xl font-black">Inventario</h1>
          <p className="mt-2 text-slate-500">
            Lotes, precios, ubicaciones y movimientos auditables.
          </p>
        </div>
        <button
          onClick={() => {
            setError("");
            methods.reset();
            setOpen(true);
          }}
          className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 font-black text-white"
        >
          <Plus size={18} /> Nuevo movimiento
        </button>
      </div>
      <div className="mt-6 inline-flex rounded-2xl bg-slate-200/70 p-1">
        <button
          onClick={() => setTab("batches")}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black ${tab === "batches" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-500"}`}
        >
          <Boxes size={17} /> Lotes
        </button>
        <button
          onClick={() => setTab("movements")}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black ${tab === "movements" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-500"}`}
        >
          <ClipboardList size={17} /> Movimientos
        </button>
      </div>
      {tab === "batches" ? (
        <div className="mt-4 rounded-3xl bg-white shadow-sm">
          <SearchBar
            value={batchSearch}
            onChange={setBatchSearch}
            placeholder="Buscar lote por producto, factura o proveedor"
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left">
              <thead className="text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-4">Producto</th>
                  <th>Factura/Proveedor</th>
                  <th>Existencias por ubicación</th>
                  <th>Montos</th>
                  <th>Recibido</th>
                </tr>
              </thead>
              <tbody>
                {visibleBatches.map((b) => (
                  <tr key={b.id} className="border-t border-slate-100">
                    <td className="px-5 py-4 font-black">
                      {b.productName}
                      <p className="text-xs font-medium text-slate-400">
                        Inicial {b.initialQuantity} · Actual {b.totalQuantity}
                      </p>
                    </td>
                    <td>
                      <p className="font-bold">
                        {b.invoiceNumber || "Sin factura"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {b.supplierName || "Sin proveedor"}
                      </p>
                    </td>
                    <td>
                      {b.locationStocks.length ? (
                        b.locationStocks.map((stock) => (
                          <p key={stock.locationId} className="text-sm">
                            <b>{stock.locationName}</b>: {stock.quantity}
                          </p>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400">
                          Sin existencia
                        </span>
                      )}
                    </td>
                    <td>
                      <p>
                        Costo <b>{money(b.unitCostCents)}</b>
                      </p>
                      <p className="text-xs text-slate-500">
                        Efectivo {money(b.cashPriceCents)} · Tarjeta{" "}
                        {money(b.cardPriceCents)}
                      </p>
                    </td>
                    <td className="text-sm">
                      {new Date(b.receivedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleBatches.length === 0 && (
            <Empty text="No hay lotes registrados." />
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-3xl bg-white shadow-sm">
          <SearchBar
            value={movementSearch}
            onChange={setMovementSearch}
            placeholder="Buscar movimiento por producto, tipo, ubicación o notas"
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-4">Fecha</th>
                  <th>Producto</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Origen → destino</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {visibleMovements.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="px-5 py-4 text-sm">
                      {new Date(m.createdAt).toLocaleString()}
                    </td>
                    <td className="font-black">{m.productName}</td>
                    <td>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                        {label(m.movementType)}
                      </span>
                    </td>
                    <td className="font-black">{m.quantity}</td>
                    <td className="text-sm">
                      {m.sourceLocationName || "Entrada externa"} →{" "}
                      {m.destinationLocationName || "Salida externa"}
                    </td>
                    <td className="text-sm text-slate-500">
                      {m.notes || "Sin notas"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleMovements.length === 0 && (
            <Empty text="No hay movimientos registrados." />
          )}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/45 p-4">
          <FormProvider {...methods}>
            <form
              onSubmit={methods.handleSubmit(submit)}
              className="mx-auto my-8 w-full max-w-xl rounded-[2rem] bg-white p-7 shadow-2xl"
            >
              <div className="flex justify-between">
                <div>
                  <h2 className="text-2xl font-black">Nuevo movimiento</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Compras, producciones e inyecciones crean lotes nuevos.
                  </p>
                </div>
                <button type="button" onClick={() => setOpen(false)}>
                  <X />
                </button>
              </div>
              <div className="mt-6 grid gap-4">
                <FieldSelect
                  label="Producto"
                  placeholder="Seleccionar producto"
                  isSearchable
                  searchPlaceholder="Buscar producto..."
                  options={availableProducts.map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                  getSearchFilter={(search, option) =>
                    option.label
                      .toLowerCase()
                      .includes(search.trim().toLowerCase())
                  }
                  register={methods.register("productId", {
                    required: "Selecciona un producto",
                  })}
                  error={methods.formState.errors.productId}
                />
                <FieldSelect
                  label="Tipo de movimiento"
                  isSearchable
                  searchPlaceholder="Buscar movimiento..."
                  options={movementOptions.map(
                    ([value, title, description]) => ({
                      value,
                      title,
                      description,
                    }),
                  )}
                  getOptionLabel={(option) => option.title}
                  getSearchFilter={(search, option) =>
                    `${option.title} ${option.description}`
                      .toLowerCase()
                      .includes(search.trim().toLowerCase())
                  }
                  renderOption={(option) => (
                    <span className="block py-0.5">
                      <span className="block font-bold text-slate-800">
                        {option.title}
                      </span>
                      <span className="mt-0.5 block text-xs font-medium leading-snug text-slate-400">
                        {option.description}
                      </span>
                    </span>
                  )}
                  register={methods.register("movementType", {
                    required: "Selecciona un tipo",
                    onChange: () => {
                      methods.setValue("productId", "");
                      methods.setValue("batchId", "");
                    },
                  })}
                  error={methods.formState.errors.movementType}
                />
                {!createsBatch && (
                  <FieldSelect
                    label="Lote"
                    placeholder="Seleccionar lote"
                    options={availableBatches.map((b) => ({
                      value: b.id,
                      label: `${b.totalQuantity} unidades | ${b.locationStocks.map((s) => `${s.locationName}: ${s.quantity}`).join(" · ")} | Costo ${money(b.unitCostCents)}`,
                    }))}
                    register={methods.register("batchId", {
                      required: "Selecciona un lote",
                    })}
                    error={methods.formState.errors.batchId}
                  />
                )}
                {needsSource && (
                  <FieldSelect
                    label="Ubicación de origen"
                    placeholder="Seleccionar origen"
                    options={activeLocations.map((l) => ({
                      value: l.id,
                      label: `${l.name} — ${l.type === "warehouse" ? "Almacén" : "POS"}`,
                    }))}
                    register={methods.register("sourceLocationId", {
                      required: "Selecciona el origen",
                    })}
                    error={methods.formState.errors.sourceLocationId}
                  />
                )}
                {needsDestination && (
                  <FieldSelect
                    label="Ubicación de destino"
                    placeholder="Seleccionar destino"
                    options={activeLocations.map((l) => ({
                      value: l.id,
                      label: `${l.name} — ${l.type === "warehouse" ? "Almacén" : "POS"}`,
                    }))}
                    register={methods.register("destinationLocationId", {
                      required: "Selecciona el destino",
                    })}
                    error={methods.formState.errors.destinationLocationId}
                  />
                )}
                <FieldInput
                  label="Cantidad"
                  type="number"
                  min={
                    type === "production" || type === "disassembly" ? 1 : 0.01
                  }
                  step={
                    type === "production" || type === "disassembly" ? 1 : "any"
                  }
                  register={methods.register("quantity", {
                    valueAsNumber: true,
                    required: "La cantidad es obligatoria",
                    min: {
                      value:
                        type === "production" || type === "disassembly"
                          ? 1
                          : 0.01,
                      message: "Debe ser mayor que cero",
                    },
                  })}
                  error={methods.formState.errors.quantity}
                />
                {createsBatch && (
                  <>
                    <FieldInput
                      label="Costo unitario"
                      type="number"
                      min="0.01"
                      step="0.01"
                      register={methods.register("unitCost", {
                        valueAsNumber: true,
                        required: "El costo es obligatorio",
                        min: {
                          value: 0.01,
                          message: "Debe ser mayor que cero",
                        },
                      })}
                      error={methods.formState.errors.unitCost}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <FieldInput
                        label="Precio efectivo"
                        type="number"
                        min="0.01"
                        step="0.01"
                        register={methods.register("cashPrice", {
                          valueAsNumber: true,
                          required: "El precio es obligatorio",
                          min: {
                            value: 0.01,
                            message: "Debe ser mayor que cero",
                          },
                        })}
                        error={methods.formState.errors.cashPrice}
                      />
                      <FieldInput
                        label="Precio tarjeta"
                        type="number"
                        min="0.01"
                        step="0.01"
                        register={methods.register("cardPrice", {
                          valueAsNumber: true,
                          required: "El precio es obligatorio",
                          min: {
                            value: 0.01,
                            message: "Debe ser mayor que cero",
                          },
                        })}
                        error={methods.formState.errors.cardPrice}
                      />
                    </div>
                  </>
                )}
                {type === "purchase" && (
                  <FieldSelect
                    label="Factura (opcional)"
                    placeholder="Sin factura"
                    isSearchable
                    searchPlaceholder="Buscar por factura o proveedor..."
                    options={invoices.map((i) => ({
                      value: i.id,
                      label: `${i.invoiceNumber} | ${i.supplierName} | ${i.invoiceDate}`,
                    }))}
                    getSearchFilter={(search, option) =>
                      option.label
                        .toLowerCase()
                        .includes(search.trim().toLowerCase())
                    }
                    register={methods.register("supplierInvoiceId")}
                  />
                )}
                {selectedProduct?.type === "composite" &&
                  ["production", "disassembly"].includes(type) && (
                    <p className="rounded-2xl bg-blue-50 p-3 text-sm font-bold text-blue-800">
                      La operación utilizará la composición configurada para{" "}
                      {selectedProduct.name}.
                    </p>
                  )}
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

function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 p-4">
      <Search size={20} className="text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent py-2 outline-none"
      />
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="grid place-items-center p-14 text-slate-400">
      <ArrowLeftRight size={38} />
      <p className="mt-3 font-bold">{text}</p>
    </div>
  );
}
