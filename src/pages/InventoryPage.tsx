import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Boxes, LogOut, PackagePlus, Plus, Search } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Field } from "../components/Field";
import type { Product } from "../types";

function money(cents: number) {
  return new Intl.NumberFormat("es", { style: "currency", currency: "CUP" }).format(cents / 100);
}

export function InventoryPage() {
  const { user, setUser } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const result = await api.products();
    setProducts(result.products);
  }
  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => products.filter((product) =>
    `${product.name} ${product.sku ?? ""}`.toLowerCase().includes(query.toLowerCase())), [products, query]);
  const lowStock = products.filter((product) => product.currentStock <= product.lowStockThreshold).length;

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api.createProduct({
        name: String(data.get("name")), sku: String(data.get("sku")), description: "",
        salePriceCents: Math.round(Number(data.get("salePrice")) * 100),
        initialStock: Number(data.get("initialStock")), lowStockThreshold: Number(data.get("lowStockThreshold")),
      });
      setShowCreate(false); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo crear el producto"); }
  }

  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!adjusting) return; setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api.adjustStock(adjusting.id, { quantityDelta: Number(data.get("quantityDelta")), reason: String(data.get("reason")) });
      setAdjusting(null); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo ajustar el inventario"); }
  }

  return (
    <main className="min-h-screen bg-[#f5f7f4] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3 font-black text-emerald-900"><span className="rounded-xl bg-emerald-100 p-2"><Boxes /></span> Kontia</div>
          <div className="flex items-center gap-3 text-sm"><span className="hidden font-bold text-slate-600 sm:inline">{user?.displayName}</span><button aria-label="Cerrar sesión" onClick={async () => { await api.logout(); setUser(null); }} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><LogOut size={19} /></button></div>
        </div>
      </header>
      <section className="mx-auto max-w-7xl p-5 sm:p-8">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-sm font-black uppercase tracking-wider text-emerald-700">Inventario</p><h1 className="mt-1 text-3xl font-black">Productos y existencias</h1><p className="mt-2 text-slate-500">Registra cada entrada o corrección para mantener un historial confiable.</p></div>
          <button onClick={() => { setError(""); setShowCreate(true); }} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 font-black text-white hover:bg-emerald-800"><Plus size={18} /> Nuevo producto</button>
        </div>
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">Productos activos</p><p className="mt-2 text-3xl font-black">{products.length}</p></div>
          <div className="rounded-3xl bg-white p-5 shadow-sm"><p className="flex items-center gap-2 text-sm font-bold text-slate-500"><AlertTriangle size={16} /> Requieren atención</p><p className="mt-2 text-3xl font-black text-amber-600">{lowStock}</p></div>
        </div>
        <div className="rounded-3xl bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 p-4"><Search className="text-slate-400" size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o SKU" className="w-full bg-transparent py-2 outline-none" /></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead className="text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-4">Producto</th><th>Precio</th><th>Existencia</th><th>Estado</th><th></th></tr></thead><tbody>
            {visible.map((product) => { const low = product.currentStock <= product.lowStockThreshold; return <tr key={product.id} className="border-t border-slate-100"><td className="px-5 py-4"><p className="font-black">{product.name}</p><p className="text-xs text-slate-400">{product.sku || "Sin SKU"}</p></td><td className="font-bold">{money(product.salePriceCents)}</td><td className="font-black">{product.currentStock}</td><td><span className={`rounded-full px-3 py-1 text-xs font-black ${low ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{low ? "Stock bajo" : "Disponible"}</span></td><td className="px-5 text-right"><button onClick={() => { setError(""); setAdjusting(product); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black hover:bg-slate-50">Ajustar</button></td></tr>; })}
          </tbody></table></div>
          {visible.length === 0 && <div className="grid place-items-center p-14 text-center text-slate-400"><PackagePlus size={40} /><p className="mt-3 font-bold">No hay productos para mostrar.</p></div>}
        </div>
      </section>
      {(showCreate || adjusting) && <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/40 p-4"><form onSubmit={showCreate ? createProduct : adjust} className="w-full max-w-lg rounded-[2rem] bg-white p-7 shadow-2xl"><h2 className="text-2xl font-black">{showCreate ? "Nuevo producto" : `Ajustar ${adjusting?.name}`}</h2><div className="mt-6 grid gap-4">{showCreate ? <><Field label="Nombre" name="name" required /><Field label="SKU (opcional)" name="sku" /><div className="grid grid-cols-2 gap-3"><Field label="Precio de venta" name="salePrice" type="number" min="0" step="0.01" required /><Field label="Existencia inicial" name="initialStock" type="number" min="0" step="0.01" required /></div><Field label="Avisar cuando quede" name="lowStockThreshold" type="number" min="0" step="0.01" required /></> : <><Field label="Cantidad (+ entrada, − salida)" name="quantityDelta" type="number" step="0.01" required /><Field label="Motivo del ajuste" name="reason" minLength={3} required /></>}</div>{error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => { setShowCreate(false); setAdjusting(null); }} className="rounded-xl px-4 py-2 font-black text-slate-500">Cancelar</button><button className="rounded-xl bg-emerald-700 px-5 py-2.5 font-black text-white">Guardar</button></div></form></div>}
    </main>
  );
}
