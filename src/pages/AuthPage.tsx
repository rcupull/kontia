import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Boxes, LoaderCircle } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { FieldInput, FieldInputPassword } from "../components/fields";

type AuthValues = {
  bootstrapSecret: string;
  businessName: string;
  displayName: string;
  username: string;
  password: string;
};

export function AuthPage() {
  const { setupRequired, setUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const methods = useForm<AuthValues>({
    defaultValues: {
      bootstrapSecret: "",
      businessName: "",
      displayName: "",
      username: "",
      password: "",
    },
  });

  async function submit(data: AuthValues) {
    setLoading(true);
    setError("");
    try {
      const result = setupRequired
        ? await api.setup({
            bootstrapSecret: data.bootstrapSecret,
            businessName: data.businessName,
            displayName: data.displayName,
            username: data.username,
            password: data.password,
          })
        : await api.login(data.username, data.password);
      setUser(result.user);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "No se pudo iniciar sesión",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[#f5f7f4] lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden bg-[#173f35] p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3 text-xl font-black">
          <Boxes /> Kontia
        </div>
        <div className="max-w-xl">
          <p className="mb-4 text-sm font-black uppercase tracking-[0.22em] text-emerald-300">
            Inventario claro. Decisiones simples.
          </p>
          <h1 className="text-5xl font-black leading-tight">
            Controla lo que entra, lo que sale y lo que necesita atención.
          </h1>
          <p className="mt-6 max-w-lg text-lg text-emerald-50/75">
            Una herramienta práctica para pequeños negocios, construida
            alrededor de movimientos auditables y existencias confiables.
          </p>
        </div>
        <p className="text-sm text-emerald-100/60">
          Gestión de inventario para equipos pequeños
        </p>
      </section>
      <section className="flex items-center justify-center p-6">
        <FormProvider {...methods}>
          <form
            onSubmit={methods.handleSubmit(submit)}
            className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-xl shadow-emerald-950/5"
          >
            <div className="mb-8">
              <span className="mb-4 inline-flex rounded-2xl bg-emerald-100 p-3 text-emerald-800">
                <Boxes />
              </span>
              <h2 className="text-3xl font-black text-slate-900">
                {setupRequired ? "Configurar Kontia" : "Bienvenido"}
              </h2>
              <p className="mt-2 text-slate-500">
                {setupRequired
                  ? "Crea el primer negocio y su cuenta propietaria."
                  : "Entra a tu espacio de trabajo."}
              </p>
            </div>
            <div className="grid gap-4">
              {setupRequired && (
                <>
                  <FieldInputPassword
                    label="Código de configuración"
                    register={methods.register("bootstrapSecret", {
                      required: "El código es obligatorio",
                    })}
                    error={methods.formState.errors.bootstrapSecret}
                  />
                  <FieldInput
                    label="Nombre del negocio"
                    register={methods.register("businessName", {
                      required: "El negocio es obligatorio",
                      minLength: {
                        value: 2,
                        message: "Usa al menos 2 caracteres",
                      },
                    })}
                    error={methods.formState.errors.businessName}
                  />
                  <FieldInput
                    label="Tu nombre"
                    register={methods.register("displayName", {
                      required: "Tu nombre es obligatorio",
                    })}
                    error={methods.formState.errors.displayName}
                  />
                </>
              )}
              <FieldInput
                label="Usuario"
                autoComplete="username"
                register={methods.register("username", {
                  required: "El usuario es obligatorio",
                })}
                error={methods.formState.errors.username}
              />
              <FieldInputPassword
                label="Contraseña"
                autoComplete={
                  setupRequired ? "new-password" : "current-password"
                }
                register={methods.register("password", {
                  required: "La contraseña es obligatoria",
                  minLength: setupRequired
                    ? { value: 10, message: "Usa al menos 10 caracteres" }
                    : undefined,
                })}
                error={methods.formState.errors.password}
              />
            </div>
            {error && (
              <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
                {error}
              </p>
            )}
            <button
              disabled={loading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3.5 font-black text-white transition hover:bg-emerald-800 disabled:opacity-60"
            >
              {loading && <LoaderCircle className="animate-spin" size={18} />}
              {setupRequired ? "Crear espacio" : "Entrar"}
            </button>
          </form>
        </FormProvider>
      </section>
    </main>
  );
}
