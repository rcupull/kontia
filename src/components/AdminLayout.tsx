import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BarChart3, Boxes, Building2, ChevronLeft, CircleDollarSign, ClipboardList,
  FileText, LayoutDashboard, LogOut, Menu, PackageOpen, Receipt, Settings, ShoppingCart,
  Store, Tags, Users, WalletCards, Warehouse, Wrench, X, MapPin } from "lucide-react";
import { useAuth } from "../auth";
import { api } from "../api";

const sections = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/categories", label: "Categorías", icon: Tags },
  { to: "/admin/products", label: "Productos", icon: Boxes },
  { to: "/admin/compositions", label: "Composiciones", icon: PackageOpen },
  { to: "/admin/suppliers", label: "Proveedores", icon: Building2 },
  { to: "/admin/supplier-invoices", label: "Facturas", icon: FileText },
  { to: "/admin/inventory", label: "Inventario", icon: Warehouse },
  { to: "/admin/locations", label: "Ubicaciones", icon: MapPin },
  { to: "/admin/orders", label: "Ventas", icon: Receipt },
  { to: "/admin/cash-sessions", label: "Sesiones de caja", icon: WalletCards },
  { to: "/admin/operating-expenses", label: "Gastos", icon: CircleDollarSign },
  { to: "/admin/financial-movements", label: "Finanzas", icon: BarChart3 },
  { to: "/admin/users", label: "Usuarios", icon: Users },
  { to: "/admin/businesses", label: "Negocios", icon: Store },
  { to: "/admin/maintenance", label: "Mantenimiento", icon: Wrench },
  { to: "/admin/settings", label: "Configuración", icon: Settings },
];

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  async function logout() { await api.logout(); setUser(null); navigate("/"); }
  const sidebar = <>
    <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
      <div className="flex items-center gap-3 text-lg font-black"><span className="rounded-xl bg-emerald-400/15 p-2 text-emerald-300"><Boxes /></span>Kontia</div>
      <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X /></button>
    </div>
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">
      {sections.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setOpen(false)}
        className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${isActive ? "bg-emerald-500 text-white" : "text-emerald-50/70 hover:bg-white/10 hover:text-white"}`}>
        <Icon size={18} />{label}</NavLink>)}
    </nav>
  </>;
  return <main className="min-h-screen bg-[#f3f5f2] text-slate-900">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-[#163f35] text-white lg:flex">{sidebar}</aside>
    {open && <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} aria-label="Cerrar menú" /><aside className="relative flex h-full w-72 flex-col bg-[#163f35] text-white">{sidebar}</aside></div>}
    <div className="lg:pl-64">
      <header className="sticky top-0 z-30 flex h-20 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7">
        <button className="rounded-xl p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu /></button>
        <div><p className="text-xs font-black uppercase tracking-widest text-emerald-700">Administración</p><p className="font-bold text-slate-500">{user?.displayName}</p></div>
        <div className="ml-auto flex gap-2"><button onClick={() => navigate("/pos")} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black hover:bg-slate-50"><ShoppingCart size={17} /> POS</button>
        <button onClick={logout} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar sesión"><LogOut size={19} /></button></div>
      </header>
      <section className="p-4 sm:p-7"><Outlet /></section>
    </div>
  </main>;
}
