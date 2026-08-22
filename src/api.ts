import type {
  Category,
  InventoryBatch,
  InventoryMovement,
  InvoiceReconciliationMovement,
  Location,
  Sale,
  CashSession,
  FinancialMovement,
  Product,
  SessionUser,
  Supplier,
  SupplierInvoice,
  BusinessUser,
  Business,
} from "./types";

export type DashboardMetrics = {
  grossSales: number;
  netSales: number;
  refunds: number;
  grossCashSales: number;
  netCashSales: number;
  cashRefunds: number;
  grossTransferSales: number;
  netTransferSales: number;
  transferRefunds: number;
  cost: number;
  profit: number;
  expenses: number;
  wasteLoss: number;
  operatingResult: number;
  orders: number;
  units: number;
};

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
  currentBusiness: () =>
    request<{ business: Business }>("/api/businesses/current"),
  updateCurrentBusiness: (input: {
    name: string;
    currency: string;
    salesTaxPercentage: number;
  }) =>
    request<{ ok: boolean }>("/api/businesses/current", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
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
  users: (search = "") =>
    request<{ users: BusinessUser[] }>(
      `/api/users?${new URLSearchParams({ search })}`,
    ),
  createUser: (input: {
    username: string;
    displayName: string;
    role: "manager" | "seller";
    password: string;
  }) =>
    request<{ id: string }>("/api/users", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateUser: (
    id: string,
    input: {
      username: string;
      displayName: string;
      role: "manager" | "seller";
      password?: string;
      isActive: boolean;
    },
  ) =>
    request<{ ok: boolean }>(`/api/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  products: () => request<{ products: Product[] }>("/api/products"),
  categories: () => request<{ categories: Category[] }>("/api/categories"),
  createCategory: (input: { name: string; icon: string }) =>
    request<{ category: Category }>("/api/categories", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateCategory: (id: string, input: { name: string; icon: string }) =>
    request<{ ok: boolean }>(`/api/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
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
  supplierInvoiceReconciliation: (id: string) =>
    request<{ movements: InvoiceReconciliationMovement[] }>(
      `/api/supplier-invoices/${id}/reconciliation`,
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
    receivedAt?: string;
    notes?: string;
  }) =>
    request<{ id: string; batchId: string }>("/api/inventory/movements", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateInventoryBatch: (
    id: string,
    input: {
      receivedAt: string;
      unitCostCents: number;
      cashPriceCents: number;
      cardPriceCents: number;
      supplierInvoiceId: string | null;
    },
  ) =>
    request<{ ok: boolean }>(`/api/inventory/batches/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  importLitePos: (input: unknown) =>
    request<{
      ok: boolean;
      imported: {
        products: number;
        batches: number;
        movements: number;
        sales: number;
        images: number;
      };
    }>("/api/maintenance/import-litepos", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  resetOperations: (confirmation: string) =>
    request<{ ok: boolean; deleted: Record<string, number> }>(
      "/api/maintenance/reset-operations",
      {
        method: "POST",
        body: JSON.stringify({ confirmation }),
      },
    ),
  adminSales: (search = "") =>
    request<{ sales: Sale[] }>(
      `/api/admin-data/sales?search=${encodeURIComponent(search)}`,
    ),
  adminSessions: (search = "") =>
    request<{ sessions: CashSession[] }>(
      `/api/admin-data/sessions?search=${encodeURIComponent(search)}`,
    ),
  financialMovements: (search = "") =>
    request<{ movements: FinancialMovement[] }>(
      `/api/admin-data/financial?search=${encodeURIComponent(search)}`,
    ),
  saveFinancialMovement: (
    id: string | null,
    input: {
      type: string;
      expenseType?: string;
      moneyLocation: string;
      amountCents: number;
      description: string;
      movementDate: string;
      notes?: string;
    },
  ) =>
    request(
      id ? `/api/admin-data/financial/${id}` : "/api/admin-data/financial",
      { method: id ? "PUT" : "POST", body: JSON.stringify(input) },
    ),
  dashboard: (from?: string, to?: string) =>
    request<{
      range: { from: string | null; to: string | null };
      totals: DashboardMetrics;
      daily: Array<{ day: string } & DashboardMetrics>;
      products: Array<
        { productId: string; productName: string } & DashboardMetrics
      >;
      finance: {
        summary: {
          cashBalance: number;
          bankBalance: number;
          totalBalance: number;
          totalIn: number;
          totalOut: number;
          netMovement: number;
          operatingExpenses: number;
          inventoryReinvestment: number;
          ownerWithdrawals: number;
          saleRefunds: number;
        };
        daily: Array<{ day: string; in: number; out: number; net: number }>;
        byType: Record<string, number>;
        expensesByType: Record<string, number>;
      };
      inventory: {
        locations: Array<{
          id: string;
          name: string;
          type: "warehouse" | "point_of_sale";
          units: number;
          valueCents: number;
        }>;
        totalUnits: number;
        totalValueCents: number;
        warehouseCents: number;
        posCents: number;
        totalWasteCents: number;
      };
    }>(
      `/api/admin-data/dashboard?${new URLSearchParams({ ...(from && { from }), ...(to && { to }) })}`,
    ),
  posState: () =>
    request<{
      locations: Array<{ id: string; name: string }>;
      categories: Array<{ id: string; name: string; icon: string }>;
      session: {
        id: string;
        locationId: string;
        locationName: string;
        openingAmountCents: number;
        expectedCashAmountCents: number;
        openedAt: string;
        offlineAuthorizedUntil: string;
        totalOrders: number;
        totalItems: number;
        cashOrders: number;
        cardOrders: number;
        cashSalesCents: number;
        cardSalesCents: number;
        cashRefundsCents: number;
        cardRefundsCents: number;
      } | null;
      products: Array<{
        id: string;
        name: string;
        imageId?: string;
        categoryId?: string;
        categoryName?: string;
        categoryIcon?: string;
        stock: number;
        cashPriceCents: number;
        cardPriceCents: number;
      }>;
    }>("/api/pos/state"),
  openPosSession: (locationId: string, openingAmountCents: number) =>
    request<{
      session: {
        id: string;
        locationId: string;
        locationName: string;
        openingAmountCents: number;
        expectedCashAmountCents: number;
        openedAt: string;
        offlineAuthorizedUntil: string;
      };
    }>("/api/pos/sessions", {
      method: "POST",
      body: JSON.stringify({ locationId, openingAmountCents }),
    }),
  createPosSale: (input: {
    cashSessionId: string;
    operationId: string;
    createdAt: string;
    expectedTotalCents: number;
    paymentMethod: "cash" | "card";
    items: Array<{ productId: string; quantity: number }>;
  }) =>
    request<{ id: string; totalCents: number }>("/api/pos/sales", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  posOrders: () =>
    request<{
      orders: Array<{
        id: string;
        paymentMethod: "cash" | "card";
        totalCents: number;
        createdAt: string;
        refundId?: string;
        refundNotes?: string;
        items: Array<{
          id: string;
          productName: string;
          quantity: number;
          unitPriceCents: number;
          totalCents: number;
        }>;
      }>;
    }>("/api/pos/orders"),
  refundPosOrder: (id: string, notes?: string) =>
    request<{ id: string }>(`/api/pos/orders/${id}/refund`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    }),
  closePosSession: (countedCashAmountCents: number) =>
    request<{ expectedCashAmountCents: number; differenceCents: number }>(
      "/api/pos/sessions/close",
      { method: "POST", body: JSON.stringify({ countedCashAmountCents }) },
    ),
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
