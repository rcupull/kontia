import type { Category, Product, SessionUser, Supplier, SupplierInvoice } from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error ?? "No pudimos completar la solicitud");
  return body as T;
}

export const api = {
  setupStatus: () => request<{ required: boolean }>("/api/auth/setup/status"),
  setup: (input: { bootstrapSecret: string; businessName: string; username: string; displayName: string; password: string }) =>
    request<{ user: SessionUser }>("/api/auth/setup", { method: "POST", body: JSON.stringify(input) }),
  login: (username: string, password: string) =>
    request<{ user: SessionUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  session: () => request<{ user: SessionUser | null }>("/api/auth/session"),
  products: () => request<{ products: Product[] }>("/api/products"),
  categories: () => request<{ categories: Category[] }>("/api/categories"),
  createCategory: (name: string) => request<{ category: Category }>("/api/categories", { method: "POST", body: JSON.stringify({ name }) }),
  createProduct: (input: { name: string; sku: string; description: string; categoryId: string | null; unitCostCents: number; cashPriceCents: number; cardPriceCents: number; lowStockThreshold: number; initialStock: number }) =>
    request<{ id: string }>("/api/products", { method: "POST", body: JSON.stringify(input) }),
  adjustStock: (id: string, input: { quantityDelta: number; reason: string }) =>
    request<{ ok: boolean }>(`/api/products/${id}/stock-adjustments`, { method: "POST", body: JSON.stringify(input) }),
  suppliers: (search = "") => request<{ suppliers: Supplier[] }>(`/api/suppliers?search=${encodeURIComponent(search)}`),
  createSupplier: (input: Omit<Supplier, "id">) => request<{ id: string }>("/api/suppliers", { method: "POST", body: JSON.stringify(input) }),
  updateSupplier: (id: string, input: Omit<Supplier, "id">) => request<{ ok: boolean }>(`/api/suppliers/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  supplierInvoices: (search = "") => request<{ invoices: SupplierInvoice[] }>(`/api/supplier-invoices?search=${encodeURIComponent(search)}`),
  createSupplierInvoice: (input: { supplierId: string; invoiceNumber: string; invoiceDate: string; totalAmountCents: number; notes?: string }) =>
    request<{ id: string }>("/api/supplier-invoices", { method: "POST", body: JSON.stringify(input) }),
};
