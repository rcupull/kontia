import type { Product, SessionUser } from "./types";

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
  createProduct: (input: { name: string; sku: string; description: string; salePriceCents: number; lowStockThreshold: number; initialStock: number }) =>
    request<{ id: string }>("/api/products", { method: "POST", body: JSON.stringify(input) }),
  adjustStock: (id: string, input: { quantityDelta: number; reason: string }) =>
    request<{ currentStock: number }>(`/api/products/${id}/stock-adjustments`, { method: "POST", body: JSON.stringify(input) }),
};
