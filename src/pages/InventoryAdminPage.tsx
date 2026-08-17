import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeftRight, Boxes, ClipboardList, Plus, Search, X } from "lucide-react";
import { api } from "../api";
import { Field } from "../components/Field";
import type { InventoryBatch, InventoryMovement, Product, SupplierInvoice } from "../types";

const movementOptions = [
  ["transferToPos", "Transferencia al POS", "Mueve unidades del almacén al punto de venta."],
  ["transferToWarehouse", "Transferencia al almacén", "Devuelve unidades del POS al almacén."],
  ["purchase", "Entrada por compra", "Crea un lote comprado y puede vincularlo a una factura."],
  ["customerReturn", "Devolución", "Devuelve al POS unidades reintegradas por un cliente."],
  ["production", "Entrada por producción", "Produce un producto compuesto y crea un lote."],
  ["inventoryInjection", "Inyección de inventario", "Agrega inventario aportado sin factura."],
  ["positiveAdjustment", "Ajuste positivo", "Suma unidades al almacén."],
  ["internalConsumption", "Consumo interno", "Registra unidades usadas por el negocio."],
  ["ownerWithdrawal", "Retiro del dueño", "Retira unidades del almacén."],
  ["waste", "Merma almacén", "Descuenta pérdidas del almacén."],
  ["posWaste", "Merma POS", "Descuenta pérdidas del POS."],
  ["negativeAdjustment", "Ajuste negativo", "Resta unidades del almacén."],
  ["transformation", "Transformación", "Consume unidades del almacén."],
  ["disassembly", "Desarmar combo", "Desarma producción y retorna componentes."],
] as const;
const label = (type: string) => movementOptions.find(([value]) => value === type)?.[1] ?? type;
const money = (cents: number) => new Intl.NumberFormat("es", { style: "currency", currency: "CUP" }).format(cents / 100);

export function InventoryAdminPage() {
  const [tab, setTab] = useState<"batches" | "movements">("batches");
  const [batchSearch, setBatchSearch] = useState(""); const [movementSearch, setMovementSearch] = useState("");
  const [batches, setBatches] = useState<InventoryBatch[]>([]); const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]); const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [open, setOpen] = useState(false); const [type, setType] = useState("transferToPos"); const [productId, setProductId] = useState("");
  const [error, setError] = useState("");
  async function load() { const [b, m, p, i] = await Promise.all([api.inventoryBatches(), api.inventoryMovements(), api.products(), api.supplierInvoices()]); setBatches(b.batches); setMovements(m.movements); setProducts(p.products); setInvoices(i.invoices); }
  useEffect(() => { void load(); }, []);
  const visibleBatches = useMemo(() => batches.filter((b) => `${b.productName} ${b.invoiceNumber ?? ""} ${b.supplierName ?? ""}`.toLowerCase().includes(batchSearch.toLowerCase())), [batches, batchSearch]);
  const visibleMovements = useMemo(() => movements.filter((m) => `${m.productName} ${label(m.movementType)} ${m.notes ?? ""}`.toLowerCase().includes(movementSearch.toLowerCase())), [movements, movementSearch]);
  const selectedProduct = products.find((p) => p.id === productId); const createsBatch = ["purchase", "production", "inventoryInjection"].includes(type);
  const availableProducts = products.filter((p) => p.isActive && (!["production", "disassembly"].includes(type) || p.type === "composite"));
  const availableBatches = batches.filter((b) => b.productId === productId && (type !== "disassembly" || b.warehouseQuantity > 0));

  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); const data = new FormData(event.currentTarget); const value = (name: string) => Number(data.get(name));
    try { await api.createInventoryMovement({ productId, movementType: type, batchId: createsBatch ? undefined : String(data.get("batchId")), quantity: value("quantity"),
      unitCostCents: createsBatch ? Math.round(value("unitCost") * 100) : undefined, cashPriceCents: createsBatch ? Math.round(value("cashPrice") * 100) : undefined,
      cardPriceCents: createsBatch ? Math.round(value("cardPrice") * 100) : undefined, supplierInvoiceId: type === "purchase" ? String(data.get("supplierInvoiceId") || "") || undefined : undefined,
      notes: String(data.get("notes") || "") }); setOpen(false); setTab("movements"); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo registrar el movimiento"); } }

  return <section><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-black uppercase tracking-wider text-emerald-700">Operaciones</p><h1 className="mt-1 text-3xl font-black">Inventario</h1><p className="mt-2 text-slate-500">Lotes, precios, ubicaciones y movimientos auditables.</p></div><button onClick={() => { setError(""); setType("transferToPos"); setProductId(""); setOpen(true); }} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 font-black text-white"><Plus size={18} /> Nuevo movimiento</button></div>
    <div className="mt-6 inline-flex rounded-2xl bg-slate-200/70 p-1"><button onClick={() => setTab("batches")} className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black ${tab === "batches" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-500"}`}><Boxes size={17} /> Lotes</button><button onClick={() => setTab("movements")} className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black ${tab === "movements" ? "bg-white text-emerald-800 shadow-sm" : "text-slate-500"}`}><ClipboardList size={17} /> Movimientos</button></div>
    {tab === "batches" ? <div className="mt-4 rounded-3xl bg-white shadow-sm"><SearchBar value={batchSearch} onChange={setBatchSearch} placeholder="Buscar lote por producto, factura o proveedor" /><div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left"><thead className="text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-4">Producto</th><th>Factura/Proveedor</th><th>Stocks</th><th>Montos</th><th>Recibido</th></tr></thead><tbody>{visibleBatches.map((b) => <tr key={b.id} className="border-t border-slate-100"><td className="px-5 py-4 font-black">{b.productName}</td><td><p className="font-bold">{b.invoiceNumber || "Sin factura"}</p><p className="text-xs text-slate-400">{b.supplierName || "Sin proveedor"}</p></td><td><p>Inicial <b>{b.initialQuantity}</b></p><p>Almacén <b>{b.warehouseQuantity}</b> · POS <b>{b.posQuantity}</b></p></td><td><p>Costo <b>{money(b.unitCostCents)}</b></p><p className="text-xs text-slate-500">Efectivo {money(b.cashPriceCents)} · Tarjeta {money(b.cardPriceCents)}</p></td><td className="text-sm">{new Date(b.receivedAt).toLocaleString()}</td></tr>)}</tbody></table></div>{visibleBatches.length === 0 && <Empty text="No hay lotes registrados." />}</div>
    : <div className="mt-4 rounded-3xl bg-white shadow-sm"><SearchBar value={movementSearch} onChange={setMovementSearch} placeholder="Buscar movimiento por producto, tipo o notas" /><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead className="text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-4">Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Saldo actual lote</th><th>Notas</th></tr></thead><tbody>{visibleMovements.map((m) => <tr key={m.id} className="border-t border-slate-100"><td className="px-5 py-4 text-sm">{new Date(m.createdAt).toLocaleString()}</td><td className="font-black">{m.productName}</td><td><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{label(m.movementType)}</span></td><td className="font-black">{m.quantity}</td><td className="text-sm">Almacén {m.currentWarehouseQuantity} · POS {m.currentPosQuantity}</td><td className="text-sm text-slate-500">{m.notes || "Sin notas"}</td></tr>)}</tbody></table></div>{visibleMovements.length === 0 && <Empty text="No hay movimientos registrados." />}</div>}
    {open && <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/45 p-4"><form onSubmit={submit} className="mx-auto my-8 w-full max-w-xl rounded-[2rem] bg-white p-7 shadow-2xl"><div className="flex justify-between"><div><h2 className="text-2xl font-black">Nuevo movimiento</h2><p className="mt-1 text-sm text-slate-500">Compras, producciones e inyecciones crean lotes nuevos.</p></div><button type="button" onClick={() => setOpen(false)}><X /></button></div><div className="mt-6 grid gap-4">
      <label className="grid gap-2 text-sm font-bold text-slate-700">Producto<select value={productId} onChange={(e) => setProductId(e.target.value)} required className="rounded-2xl border border-slate-200 bg-white px-4 py-3"><option value="" disabled>Seleccionar producto</option>{availableProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-bold text-slate-700">Tipo de movimiento<select value={type} onChange={(e) => { setType(e.target.value); setProductId(""); }} required className="rounded-2xl border border-slate-200 bg-white px-4 py-3">{movementOptions.map(([value, title, description]) => <option key={value} value={value}>{title} — {description}</option>)}</select></label>
      {!createsBatch && <label className="grid gap-2 text-sm font-bold text-slate-700">Lote<select name="batchId" required className="rounded-2xl border border-slate-200 bg-white px-4 py-3"><option value="">Seleccionar lote</option>{availableBatches.map((b) => <option key={b.id} value={b.id}>Almacén {b.warehouseQuantity} | POS {b.posQuantity} | Costo {money(b.unitCostCents)}</option>)}</select></label>}
      <Field label="Cantidad" name="quantity" type="number" min={type === "production" || type === "disassembly" ? 1 : 0.01} step={type === "production" || type === "disassembly" ? 1 : "any"} required />
      {createsBatch && <><Field label="Costo unitario" name="unitCost" type="number" min="0.01" step="0.01" required /><div className="grid grid-cols-2 gap-3"><Field label="Precio efectivo" name="cashPrice" type="number" min="0.01" step="0.01" required /><Field label="Precio tarjeta" name="cardPrice" type="number" min="0.01" step="0.01" required /></div></>}
      {type === "purchase" && <label className="grid gap-2 text-sm font-bold text-slate-700">Factura (opcional)<select name="supplierInvoiceId" className="rounded-2xl border border-slate-200 bg-white px-4 py-3"><option value="">Sin factura</option>{invoices.map((i) => <option key={i.id} value={i.id}>{i.invoiceNumber} | {i.supplierName} | {i.invoiceDate}</option>)}</select></label>}
      {selectedProduct?.type === "composite" && ["production", "disassembly"].includes(type) && <p className="rounded-2xl bg-blue-50 p-3 text-sm font-bold text-blue-800">La operación utilizará la composición configurada para {selectedProduct.name}.</p>}
      <label className="grid gap-2 text-sm font-bold text-slate-700">Notas<textarea name="notes" rows={3} className="rounded-2xl border border-slate-200 px-4 py-3 outline-none" /></label></div>
      {error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setOpen(false)} className="px-4 font-black text-slate-500">Cancelar</button><button className="rounded-xl bg-emerald-700 px-5 py-2.5 font-black text-white">Guardar</button></div></form></div>}
  </section>;
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) { return <div className="flex items-center gap-3 border-b border-slate-100 p-4"><Search size={20} className="text-slate-400" /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent py-2 outline-none" /></div>; }
function Empty({ text }: { text: string }) { return <div className="grid place-items-center p-14 text-slate-400"><ArrowLeftRight size={38} /><p className="mt-3 font-bold">{text}</p></div>; }
