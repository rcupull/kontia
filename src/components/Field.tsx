import type { InputHTMLAttributes } from "react";

export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-700">
      {label}
      <input {...props} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10" />
    </label>
  );
}
