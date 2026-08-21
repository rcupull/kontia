import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { ImagePlus, PackagePlus, Pencil, Plus, Search, X } from "lucide-react";
import { api } from "../api";
import { FieldInput, FieldSelect } from "../components/fields";
import { PageSpinner } from "../components/Spinner";
import type { Category, Product } from "../types";

async function optimizeProductImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("No se pudo optimizar la imagen")),
      "image/webp",
      0.75,
    ),
  );
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, {
    type: "image/webp",
  });
}

export function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | null | undefined>();
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const methods = useForm<{
    name: string;
    type: "basic" | "composite";
    categoryId: string;
  }>({ defaultValues: { name: "", type: "basic", categoryId: "" } });

  async function load() {
    const [productResult, categoryResult] = await Promise.all([
      api.products(),
      api.categories(),
    ]);
    setProducts(productResult.products);
    setCategories(categoryResult.categories);
  }
  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, []);
  useEffect(
    () => () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const visible = useMemo(
    () =>
      products.filter((product) =>
        `${product.name} ${product.categoryName ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [products, query],
  );

  function openForm(product: Product | null) {
    setError("");
    setImage(null);
    setPreview(product?.imageId ? `/media/${product.imageId}` : "");
    methods.reset({
      name: product?.name ?? "",
      type: product?.type ?? "basic",
      categoryId: product?.categoryId ?? "",
    });
    setEditing(product);
  }

  async function submit(values: {
    name: string;
    type: "basic" | "composite";
    categoryId: string;
  }) {
    setError("");
    try {
      let imageId = editing?.imageId ?? null;
      if (image)
        imageId = (await api.uploadImage(await optimizeProductImage(image))).id;
      const input = {
        name: values.name,
        description: "",
        categoryId: values.categoryId || null,
        imageId,
        type: values.type,
      };
      if (editing) await api.updateProduct(editing.id, input);
      else await api.createProduct(input);
      setEditing(undefined);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo guardar el producto",
      );
    }
  }

  async function toggle(product: Product) {
    await api.setProductActive(product.id, !Boolean(product.isActive));
    await load();
  }

  if (loading) return <PageSpinner label="Cargando productos…" />;
  return (
    <section>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-emerald-700">
            Catálogo
          </p>
          <h1 className="mt-1 text-3xl font-black">Productos</h1>
          <p className="mt-2 text-slate-500">
            El catálogo no almacena precios ni existencias; ambos provienen de
            sus lotes.
          </p>
        </div>
        <button
          disabled={categories.length === 0}
          onClick={() => openForm(null)}
          className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 font-black text-white disabled:opacity-40"
        >
          <Plus size={18} /> Nuevo producto
        </button>
      </div>
      {categories.length === 0 && (
        <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
          Primero registra una categoría.
        </p>
      )}
      <div className="mt-6 rounded-3xl bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 p-4">
          <Search size={20} className="text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar producto o categoría"
            className="w-full bg-transparent py-2 outline-none"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-4">Producto</th>
                <th>Tipo</th>
                <th>Stocks derivados</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => (
                <tr key={product.id} className="border-t border-slate-100">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-slate-100">
                        {product.imageId ? (
                          <img
                            src={`/media/${product.imageId}`}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <PackagePlus className="text-slate-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-black">{product.name}</p>
                        <p className="text-xs text-slate-400">
                          {product.categoryName || "Sin categoría"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ${product.type === "composite" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}
                    >
                      {product.type === "composite" ? "Compuesto" : "Básico"}
                    </span>
                  </td>
                  <td>
                    <p className="font-bold">
                      Almacenes {product.warehouseStock}
                    </p>
                    <p className="text-xs text-slate-400">
                      Puntos de venta {product.posStock} · Total{" "}
                      {product.currentStock}
                    </p>
                  </td>
                  <td>
                    <button
                      onClick={() => void toggle(product)}
                      className={`rounded-full px-3 py-1 text-xs font-black ${product.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
                    >
                      {product.isActive ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                  <td className="px-5 text-right">
                    <button
                      onClick={() => openForm(product)}
                      className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"
                    >
                      <Pencil size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visible.length === 0 && (
          <div className="grid place-items-center p-14 text-slate-400">
            <PackagePlus size={40} />
            <p className="mt-3 font-bold">No hay productos para mostrar.</p>
          </div>
        )}
      </div>
      {editing !== undefined && (
        <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-950/45 p-4">
          <FormProvider {...methods}>
            <form
              onSubmit={methods.handleSubmit(submit)}
              className="my-8 w-full max-w-lg rounded-[2rem] bg-white p-7 shadow-2xl"
            >
              <div className="flex justify-between">
                <div>
                  <h2 className="text-2xl font-black">
                    {editing ? "Editar producto" : "Nuevo producto"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Los precios y cantidades se registran desde Inventario.
                  </p>
                </div>
                <button type="button" onClick={() => setEditing(undefined)}>
                  <X />
                </button>
              </div>
              <div className="mt-6 grid gap-4">
                <FieldInput
                  label="Nombre"
                  register={methods.register("name", {
                    required: "El nombre es obligatorio",
                  })}
                  error={methods.formState.errors.name}
                />
                <FieldSelect
                  label="Tipo"
                  options={[
                    { value: "basic", label: "Básico" },
                    { value: "composite", label: "Compuesto" },
                  ]}
                  register={methods.register("type", {
                    required: "Selecciona el tipo",
                  })}
                  error={methods.formState.errors.type}
                />
                <FieldSelect
                  label="Categoría"
                  placeholder="Selecciona la categoría"
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                  register={methods.register("categoryId", {
                    required: "Selecciona una categoría",
                  })}
                  error={methods.formState.errors.categoryId}
                />
                <div>
                  <p className="mb-2 text-sm font-bold text-slate-700">
                    Imagen
                  </p>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-500">
                    <ImagePlus size={18} /> Subir imagen
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        setImage(file);
                        if (file) setPreview(URL.createObjectURL(file));
                      }}
                    />
                  </label>
                  {preview && (
                    <img
                      src={preview}
                      alt="Vista previa"
                      className="mt-3 h-32 w-32 rounded-2xl object-cover"
                    />
                  )}
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
                  onClick={() => setEditing(undefined)}
                  className="px-4 font-black text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  disabled={methods.formState.isSubmitting}
                  className="rounded-xl bg-emerald-700 px-5 py-2.5 font-black text-white"
                >
                  Guardar
                </button>
              </div>
            </form>
          </FormProvider>
        </div>
      )}
    </section>
  );
}
