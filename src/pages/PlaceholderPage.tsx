import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

export function PlaceholderPage({ title, description, icon: Icon = Construction }: { title: string; description: string; icon?: LucideIcon }) {
  return <section><p className="text-sm font-black uppercase tracking-wider text-emerald-700">Kontia</p><h1 className="mt-1 text-3xl font-black">{title}</h1>
    <div className="mt-6 grid min-h-72 place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><Icon className="mx-auto text-emerald-700" size={42} /><p className="mt-4 max-w-lg font-bold text-slate-600">{description}</p><p className="mt-2 text-sm text-slate-400">La ruta ya está integrada al panel administrativo.</p></div></div></section>;
}
