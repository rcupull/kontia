import { useState, type FormEvent } from "react";
import { Boxes, LoaderCircle } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Field } from "../components/Field";

export function AuthPage() {
  const { setupRequired, setUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = setupRequired
        ? await api.setup({
            bootstrapSecret: String(data.get("bootstrapSecret")),
            businessName: String(data.get("businessName")),
            displayName: String(data.get("displayName")),
            username: String(data.get("username")),
            password: String(data.get("password")),
          })
        : await api.login(String(data.get("username")), String(data.get("password")));
      setUser(result.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[#f5f7f4] lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden bg-[#173f35] p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3 text-xl font-black"><Boxes /> Kontia</div>
        <div className="max-w-xl">
          <p className="mb-4 text-sm font-black uppercase tracking-[0.22em] text-emerald-300">Inventario claro. Decisiones simples.</p>
          <h1 className="text-5xl font-black leading-tight">Controla lo que entra, lo que sale y lo que necesita atención.</h1>
          <p className="mt-6 max-w-lg text-lg text-emerald-50/75">Una herramienta práctica para pequeños negocios, construida alrededor de movimientos auditables y existencias confiables.</p>
        </div>
        <p className="text-sm text-emerald-100/60">Gestión de inventario para equipos pequeños</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-xl shadow-emerald-950/5">
          <div className="mb-8">
            <span className="mb-4 inline-flex rounded-2xl bg-emerald-100 p-3 text-emerald-800"><Boxes /></span>
            <h2 className="text-3xl font-black text-slate-900">{setupRequired ? "Configurar Kontia" : "Bienvenido"}</h2>
            <p className="mt-2 text-slate-500">{setupRequired ? "Crea el primer negocio y su cuenta propietaria." : "Entra a tu espacio de trabajo."}</p>
          </div>
          <div className="grid gap-4">
            {setupRequired && <>
              <Field label="Código de configuración" name="bootstrapSecret" type="password" required />
              <Field label="Nombre del negocio" name="businessName" required />
              <Field label="Tu nombre" name="displayName" required />
            </>}
            <Field label="Usuario" name="username" autoComplete="username" required />
            <Field label="Contraseña" name="password" type="password" minLength={setupRequired ? 10 : undefined} autoComplete={setupRequired ? "new-password" : "current-password"} required />
          </div>
          {error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
          <button disabled={loading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3.5 font-black text-white transition hover:bg-emerald-800 disabled:opacity-60">
            {loading && <LoaderCircle className="animate-spin" size={18} />}{setupRequired ? "Crear espacio" : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
