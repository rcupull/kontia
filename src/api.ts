import type {
  Category,
  InventoryBatch,
  InventoryMovement,
  Location,
  Product,
  SessionUser,
  Supplier,
  SupplierInvoice,
} from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = (await response.json().catch(() => null)) as
    (T & { error?: string }) | null;
  if (!response.ok)
    throw new Error(body?.error ?? "No pudimos completar la solicitud");
  return body as T;
}

export const api = {
  setupStatus: () => request<{ required: boolean }>("/api/auth/setup/status"),
  setup: (input: {
    bootstrapSecret: string;
    businessName: string;
    username: string;
    displayName: string;
    password: string;
  }) =>
    request<{ user: SessionUser }>("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  login: (username: string, password: string) =>
    request<{ user: SessionUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () =>
    request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  session: () => request<{ user: SessionUser | null }>("/api/auth/session"),
  products: () => request<{ products: Product[] }>("/api/products"),
  categories: () => request<{ categories: Category[] }>("/api/categories"),
  createCategory: (name: string) =>
    request<{ category: Category }>("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  createProduct: (input: {
    name: string;
    description: string;
    categoryId: string | null;
    imageId: string | null;
    type: "basic" | "composite";
  }) =>
    request<{ id: string }>("/api/products", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateProduct: (
    id: string,
    input: {
      name: string;
      description: string;
      categoryId: string | null;
      imageId: string | null;
      type: "basic" | "composite";
    },
  ) =>
    request<{ ok: boolean }>(`/api/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  setProductActive: (id: string, isActive: boolean) =>
    request<{ ok: boolean }>(`/api/products/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }),
  uploadImage: async (file: File) => {
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/images", { method: "POST", body });
    const result = (await response.json()) as {
      id?: string;
      imageUrl?: string;
      error?: string;
    };
    if (!response.ok || !result.id)
      throw new Error(result.error ?? "No se pudo subir la imagen");
    return result as { id: string; imageUrl: string };
  },
  adjustStock: (
    id: string,
    input: { locationId: string; quantityDelta: number; reason: string },
  ) =>
    request<{ ok: boolean }>(`/api/products/${id}/stock-adjustments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  suppliers: (search = "") =>
    request<{ suppliers: Supplier[] }>(
      `/api/suppliers?search=${encodeURIComponent(search)}`,
    ),
  createSupplier: (input: Omit<Supplier, "id">) =>
    request<{ id: string }>("/api/suppliers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateSupplier: (id: string, input: Omit<Supplier, "id">) =>
    request<{ ok: boolean }>(`/api/suppliers/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  supplierInvoices: (search = "") =>
    request<{ invoices: SupplierInvoice[] }>(
      `/api/supplier-invoices?search=${encodeURIComponent(search)}`,
    ),
  createSupplierInvoice: (input: {
    supplierId: string;
    invoiceNumber: string;
    invoiceDate: string;
    totalAmountCents: number;
    notes?: string;
  }) =>
    request<{ id: string }>("/api/supplier-invoices", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateSupplierInvoice: (
    id: string,
    input: {
      supplierId: string;
      invoiceNumber: string;
      invoiceDate: string;
      totalAmountCents: number;
      notes?: string;
    },
  ) =>
    request<{ ok: boolean }>(`/api/supplier-invoices/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  inventoryBatches: (search = "") =>
    request<{ batches: InventoryBatch[] }>(
      `/api/inventory/batches?search=${encodeURIComponent(search)}`,
    ),
  inventoryMovements: (search = "") =>
    request<{ movements: InventoryMovement[] }>(
      `/api/inventory/movements?search=${encodeURIComponent(search)}`,
    ),
  createInventoryMovement: (input: {
    productId: string;
    batchId?: string;
    movementType: string;
    quantity: number;
    sourceLocationId?: string;
    destinationLocationId?: string;
    unitCostCents?: number;
    cashPriceCents?: number;
    cardPriceCents?: number;
    supplierInvoiceId?: string;
    notes?: string;
  }) =>
    request<{ id: string; batchId: string }>("/api/inventory/movements", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  locations: (search = "") =>
    request<{ locations: Location[] }>(
      `/api/locations?search=${encodeURIComponent(search)}`,
    ),
  createLocation: (input: {
    code: string;
    name: string;
    type: Location["type"];
    address?: string;
  }) =>
    request<{ id: string }>("/api/locations", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateLocation: (
    id: string,
    input: {
      code: string;
      name: string;
      type: Location["type"];
      address?: string;
    },
  ) =>
    request<{ ok: boolean }>(`/api/locations/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  setLocationActive: (id: string, isActive: boolean) =>
    request<{ ok: boolean }>(`/api/locations/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }),
};
