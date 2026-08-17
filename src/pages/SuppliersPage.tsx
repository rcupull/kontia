import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, Pencil, Plus, Search, X } from "lucide-react";
import { api } from "../api";
import { Field } from "../components/Field";
import type { Supplier } from "../types";

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Supplier | null | undefined>();
  const [error, setError] = useState("");
  async function load() { setSuppliers((await api.suppliers()).suppliers); }
  useEffect(() => { void load(); }, []);
  const visible = useMemo(() => suppliers.filter((s) => `${s.name} ${s.taxId ?? ""} ${s.contactName ?? ""}`.toLowerCase().includes(query.toLowerCase())), [suppliers, query]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    const input = { name: String(data.get("name")), taxId: String(data.get("taxId")), contactName: String(data.get("contactName")), email: String(data.get("email")), phone: String(data.get("phone")), address: String(data.get("address")), city: String(data.get("city")), country: String(data.get("country")), notes: String(data.get("notes")) };
    try { if (editing) await api.updateSupplier(editing.id, input); else await api.createSupplier(input); setEditing(undefined); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el proveedor"); }
  }
  return <section><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-black uppercase tracking-wider text-emerald-700">Compras</p><h1 className="mt-1 text-3xl font-black">Proveedores</h1><p className="mt-2 text-slate-500">Contactos y empresas que abastecen el inventario.</p></div><button onClick={() => { setError(""); setEditing(null); }} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 font-black text-white"><Plus size={18} /> Nuevo proveedor</button></div>
    <div className="mt-6 rounded-3xl bg-white shadow-sm"><div className="flex items-center gap-3 border-b border-slate-100 p-4"><Search className="text-slate-400" size={20} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar proveedor" className="w-full bg-transparent py-2 outline-none" /></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead className="text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-4">Proveedor</th><th>Contacto</th><th>Ubicación</th><th></th></tr></thead><tbody>{visible.map((supplier) => <tr key={supplier.id} className="border-t border-slate-100"><td className="px-5 py-4"><p className="font-black">{supplier.name}</p><p className="text-xs text-slate-400">{supplier.taxId || "Sin identificación fiscal"}</p></td><td><p className="font-bold">{supplier.contactName || "—"}</p><p className="text-xs text-slate-400">{supplier.phone || supplier.email || "Sin contacto"}</p></td><td className="text-sm text-slate-600">{[supplier.city, supplier.country].filter(Boolean).join(", ") || "—"}</td><td className="px-5 text-right"><button onClick={() => { setError(""); setEditing(supplier); }} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><Pencil size={16} /></button></td></tr>)}</tbody></table></div>
      {visible.length === 0 && <div className="grid place-items-center p-14 text-center text-slate-400"><Building2 size={40} /><p className="mt-3 font-bold">No hay proveedores para mostrar.</p></div>}</div>
    {editing !== undefined && <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-950/45 p-4"><form onSubmit={submit} className="my-8 w-full max-w-2xl rounded-[2rem] bg-white p-7 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-2xl font-black">{editing ? "Editar proveedor" : "Nuevo proveedor"}</h2><button type="button" onClick={() => setEditing(undefined)}><X /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Nombre" name="name" defaultValue={editing?.name} required /><Field label="Identificación fiscal" name="taxId" defaultValue={editing?.taxId} /><Field label="Persona de contacto" name="contactName" defaultValue={editing?.contactName} /><Field label="Teléfono" name="phone" defaultValue={editing?.phone} /><Field label="Correo" name="email" type="email" defaultValue={editing?.email} /><Field label="Dirección" name="address" defaultValue={editing?.address} /><Field label="Ciudad" name="city" defaultValue={editing?.city} /><Field label="País" name="country" defaultValue={editing?.country} /><div className="sm:col-span-2"><Field label="Notas" name="notes" defaultValue={editing?.notes} /></div></div>{error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setEditing(undefined)} className="px-4 py-2 font-black text-slate-500">Cancelar</button><button className="rounded-xl bg-emerald-700 px-5 py-2.5 font-black text-white">Guardar</button></div></form></div>}
  </section>;
}
