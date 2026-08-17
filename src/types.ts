export type SessionUser = {
  id: string;
  businessId: string;
  displayName: string;
  role: "owner" | "manager" | "seller";
};

export type Product = {
  id: string;
  sku: string | null;
  name: string;
  description: string;
  cashPriceCents: number;
  cardPriceCents: number;
  warehouseStock: number;
  posStock: number;
  currentStock: number;
  lowStockThreshold: number;
  isActive: number;
};

export type Supplier = {
  id: string; name: string; taxId?: string; contactName?: string; email?: string;
  phone?: string; address?: string; city?: string; country?: string; notes?: string;
};

export type SupplierInvoice = {
  id: string; supplierId: string; supplierName: string; invoiceNumber: string;
  invoiceDate: string; totalAmountCents: number; notes?: string; batchCount: number;
};

export type Category = { id: string; name: string; createdAt: string; updatedAt: string };
