import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Pencil, Plus, Search, X } from "lucide-react";
import { api } from "../api";
import { FieldInput, FieldSelect } from "../components/fields";
import { PageSpinner } from "../components/Spinner";
import type { Category } from "../types";
import { categoryIcons, filterCategoryIcons } from "./categoryIcons";

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const methods = useForm<{ name: string; icon: string }>({
    defaultValues: { name: "", icon: "🛒" },
  });
  async function load() {
    setCategories((await api.categories()).categories);
  }
  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, []);
  const visible = useMemo(
    () =>
      categories.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [categories, query],
  );
  function showForm(category?: Category) {
    setEditing(category ?? null);
    setError("");
    methods.reset({
      name: category?.name ?? "",
      icon: category?.icon || "🛒",
    });
    setOpen(true);
  }
  async function submit(values: { name: string; icon: string }) {
    setError("");
    try {
      editing
        ? await api.updateCategory(editing.id, values)
        : await api.createCategory(values);
      setOpen(false);
      methods.reset();
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo crear la categoría",
      );
    }
  }
  if (loading) return <PageSpinner label="Cargando categorías…" />;
  return (
    <section>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-emerald-700">
            Catálogo
          </p>
          <h1 className="mt-1 text-3xl font-black">Categorías</h1>
          <p className="mt-2 text-slate-500">
            Organiza los productos para encontrarlos rápidamente en el POS.
          </p>
        </div>
        <button
          onClick={() => showForm()}
          className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 font-black text-white"
        >
          <Plus size={18} /> Nueva categoría
        </button>
      </div>
      <div className="mt-6 rounded-3xl bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 p-4">
          <Search size={20} className="text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar categoría"
            className="w-full bg-transparent py-2 outline-none"
          />
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((category) => (
            <article
              key={category.id}
              className="flex items-center gap-3 rounded-2xl border border-slate-100 p-4"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-2xl">
                {category.icon || "🛒"}
              </span>
              <p className="flex-1 font-black">{category.name}</p>
              <button
                type="button"
                onClick={() => showForm(category)}
                className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"
                aria-label={`Editar ${category.name}`}
              >
                <Pencil size={16} />
              </button>
            </article>
          ))}
        </div>
        {visible.length === 0 && (
          <p className="p-12 text-center font-bold text-slate-400">
            No hay categorías para mostrar.
          </p>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4">
          <FormProvider {...methods}>
            <form
              onSubmit={methods.handleSubmit(submit)}
              className="w-full max-w-md rounded-[2rem] bg-white p-7"
            >
              <div className="flex justify-between">
                <h2 className="text-2xl font-black">
                  {editing ? "Editar categoría" : "Nueva categoría"}
                </h2>
                <button type="button" onClick={() => setOpen(false)}>
                  <X />
                </button>
              </div>
              <div className="mt-6">
                <FieldInput
                  label="Nombre"
                  register={methods.register("name", {
                    required: "El nombre es obligatorio",
                    minLength: {
                      value: 2,
                      message: "Usa al menos 2 caracteres",
                    },
                  })}
                  error={methods.formState.errors.name}
                />
                <div className="mt-4">
                  <FieldSelect
                    label="Icono"
                    placeholder="Selecciona un icono"
                    isSearchable
                    searchPlaceholder="Buscar icono..."
                    options={categoryIcons}
                    getOptionLabel={(option) =>
                      `${option.value} ${option.label}`
                    }
                    getOptionValue={(option) => option.value}
                    renderOption={(option) => (
                      <span className="flex items-center gap-2">
                        <span className="text-xl">{option.value}</span>
                        <span>{option.label}</span>
                      </span>
                    )}
                    getSearchFilter={filterCategoryIcons}
                    register={methods.register("icon", {
                      required: "El icono es obligatorio",
                    })}
                    error={methods.formState.errors.icon}
                  />
                </div>
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
                  {editing ? "Guardar cambios" : "Guardar"}
                </button>
              </div>
            </form>
          </FormProvider>
        </div>
      )}
    </section>
  );
}
