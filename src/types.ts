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
  salePriceCents: number;
  currentStock: number;
  lowStockThreshold: number;
  isActive: number;
};
