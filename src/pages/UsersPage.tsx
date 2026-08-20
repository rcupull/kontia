import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Pencil, Plus, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import {
  FieldInput,
  FieldInputPassword,
  FieldSelect,
} from "../components/fields";
import type { BusinessUser } from "../types";

type FormValues = {
  username: string;
  displayName: string;
  role: "manager" | "seller";
  password: string;
  isActive: "true" | "false";
};
const roleLabel = {
  owner: "Propietario",
  manager: "Administrador",
  seller: "Vendedor",
};

export function UsersPage() {
  const { user: sessionUser } = useAuth();
  const [users, setUsers] = useState<BusinessUser[]>([]),
    [search, setSearch] = useState(""),
    [editing, setEditing] = useState<BusinessUser | null>(null),
    [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const methods = useForm<FormValues>({
    defaultValues: {
      username: "",
      displayName: "",
      role: "seller",
      password: "",
      isActive: "true",
    },
  });
  async function load(value = search) {
    const result = await api.users(value);
    setUsers(result.users);
  }
  useEffect(() => {
    if (sessionUser?.role !== "owner") return;
    const timer = window.setTimeout(
      () =>
        void load(search).catch(() =>
          setError("No se pudieron cargar los usuarios"),
        ),
      200,
    );
    return () => window.clearTimeout(timer);
  }, [search, sessionUser?.role]);
  function showForm(user?: BusinessUser) {
    setEditing(user ?? null);
    setError("");
    methods.reset(
      user
        ? {
            username: user.username,
            displayName: user.displayName,
            role: user.role === "manager" ? "manager" : "seller",
            password: "",
            isActive: user.isActive ? "true" : "false",
          }
        : {
            username: "",
            displayName: "",
            role: "seller",
            password: "",
            isActive: "true",
          },
    );
    setOpen(true);
  }
  async function submit(values: FormValues) {
    setError("");
    try {
      if (editing)
        await api.updateUser(editing.id, {
          username: values.username,
          displayName: values.displayName,
          role: values.role,
          isActive: values.isActive === "true",
          ...(values.password && { password: values.password }),
        });
      else
        await api.createUser({
          username: values.username,
          displayName: values.displayName,
          role: values.role,
          password: values.password,
        });
      setOpen(false);
      setEditing(null);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo guardar el usuario",
      );
    }
  }
  if (sessionUser?.role !== "owner")
    return (
      <section className="rounded-3xl bg-white p-8 shadow-sm">
        <ShieldCheck className="text-amber-600" size={38} />
        <h1 className="mt-4 text-2xl font-black">Acceso restringido</h1>
        <p className="mt-2 text-slate-500">
          Solo el propietario principal puede administrar usuarios.
        </p>
      </section>
    );
  return (
    <section>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-emerald-700">
            Seguridad
          </p>
          <h1 className="mt-1 text-3xl font-black">Usuarios</h1>
          <p className="mt-2 text-slate-500">
            Accesos del negocio, roles y estado de las cuentas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => showForm()}
          className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 font-black text-white"
        >
          <Plus size={18} /> Nuevo usuario
        </button>
      </div>
      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white px-4 shadow-sm">
        <Search size={19} className="text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre o usuario"
          className="w-full bg-transparent py-3.5 outline-none"
        />
      </div>
      {error && !open && (
        <p className="mt-4 rounded-2xl bg-red-50 p-3 font-bold text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4 overflow-x-auto rounded-3xl bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left">
          <thead className="text-xs uppercase text-slate-400">
            <tr>
              <th className="px-5 py-4">Nombre</th>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Creado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-slate-100">
                <td className="px-5 py-4 font-black">{user.displayName}</td>
                <td>{user.username}</td>
                <td>
                  <span className="font-bold">{roleLabel[user.role]}</span>
                </td>
                <td>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${user.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                  >
                    {user.isActive ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td>{new Date(user.createdAt).toLocaleDateString("es")}</td>
                <td className="px-5 text-right">
                  <button
                    type="button"
                    disabled={user.role === "owner"}
                    onClick={() => showForm(user)}
                    title={
                      user.role === "owner"
                        ? "El propietario principal está protegido"
                        : "Editar usuario"
                    }
                    className="rounded-xl border border-slate-200 p-2 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Pencil size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && (
          <div className="grid place-items-center p-14 text-slate-400">
            <UserRound size={40} />
            <p className="mt-3 font-bold">No hay usuarios para mostrar.</p>
          </div>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/45 p-4">
          <FormProvider {...methods}>
            <form
              onSubmit={methods.handleSubmit(submit)}
              className="mx-auto my-10 w-full max-w-lg rounded-[2rem] bg-white p-7"
            >
              <div className="flex justify-between">
                <div>
                  <h2 className="text-2xl font-black">
                    {editing ? "Editar usuario" : "Nuevo usuario"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {editing
                      ? "Actualiza los datos o establece una contraseña nueva."
                      : "Crea un acceso para un administrador o vendedor."}
                  </p>
                </div>
                <button type="button" onClick={() => setOpen(false)}>
                  <X />
                </button>
              </div>
              <div className="mt-6 grid gap-4">
                <FieldInput
                  label="Nombre completo"
                  register={methods.register("displayName", {
                    required: "El nombre es obligatorio",
                  })}
                  error={methods.formState.errors.displayName}
                />
                <FieldInput
                  label="Nombre de usuario"
                  autoComplete="off"
                  register={methods.register("username", {
                    required: "El usuario es obligatorio",
                    minLength: {
                      value: 3,
                      message: "Utiliza al menos 3 caracteres",
                    },
                  })}
                  error={methods.formState.errors.username}
                />
                <FieldSelect
                  label="Rol"
                  options={[
                    { value: "manager", label: "Administrador" },
                    { value: "seller", label: "Vendedor" },
                  ]}
                  register={methods.register("role", { required: true })}
                />
                <FieldInputPassword
                  label={editing ? "Nueva contraseña (opcional)" : "Contraseña"}
                  autoComplete="new-password"
                  register={methods.register("password", {
                    required: editing ? false : "La contraseña es obligatoria",
                    validate: (value) =>
                      !value ||
                      value.length >= 10 ||
                      "Utiliza al menos 10 caracteres",
                  })}
                  error={methods.formState.errors.password}
                />
                {editing && (
                  <FieldSelect
                    label="Estado"
                    options={[
                      { value: "true", label: "Activo" },
                      { value: "false", label: "Inactivo" },
                    ]}
                    register={methods.register("isActive")}
                  />
                )}
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
                  className="rounded-xl bg-emerald-700 px-5 py-2.5 font-black text-white disabled:opacity-50"
                >
                  {editing ? "Guardar cambios" : "Crear usuario"}
                </button>
              </div>
            </form>
          </FormProvider>
        </div>
      )}
    </section>
  );
}
