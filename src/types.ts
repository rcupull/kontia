export type SessionUser = {
  id: string;
  businessId: string;
  displayName: string;
  role: "owner" | "manager" | "seller";
};

export type Business = {
  id: string;
  name: string;
  currency: string;
  salesTaxPercentage: number;
  createdAt: string;
  updatedAt: string;
};

export type BusinessUser = {
  id: string;
  username: string;
  displayName: string;
  role: "owner" | "manager" | "seller";
  isActive: number;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  sku: string | null;
  name: string;
  description: string;
  type: "basic" | "composite";
  categoryId: string | null;
  categoryName: string | null;
  imageId: string | null;
  cashPriceCents: number;
  cardPriceCents: number;
  warehouseStock: number;
  posStock: number;
  currentStock: number;
  isActive: number;
};

export type Supplier = {
  id: string;
  name: string;
  taxId?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  notes?: string;
};

export type SupplierInvoice = {
  id: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmountCents: number;
  notes?: string;
  batchCount: number;
  batchesTotalCents: number;
  hasInvalidCosts: number;
};

export type InvoiceReconciliationMovement = {
  id: string;
  createdAt: string;
  movementType: "purchase" | "positiveAdjustment" | "negativeAdjustment";
  quantity: number;
  batchId: string;
  receivedAt: string;
  unitCostCents: number;
  productId: string;
  productName: string;
  totalCostCents: number;
};

export type Category = {
  id: string;
  name: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
};
export type Location = {
  id: string;
  code: string;
  name: string;
  type: "warehouse" | "point_of_sale";
  address?: string;
  isActive: number;
  totalUnits: number;
};
export type LocationStock = {
  locationId: string;
  locationName: string;
  locationType: "warehouse" | "point_of_sale";
  quantity: number;
};

export type InventoryBatch = {
  id: string;
  productId: string;
  productName: string;
  supplierInvoiceId?: string;
  invoiceNumber?: string;
  supplierName?: string;
  initialQuantity: number;
  totalQuantity: number;
  locationStocks: LocationStock[];
  unitCostCents: number;
  cashPriceCents: number;
  cardPriceCents: number;
  receivedAt: string;
};
export type InventoryMovement = {
  id: string;
  productId: string;
  productName: string;
  batchId: string;
  movementType: string;
  quantity: number;
  notes?: string;
  createdAt: string;
  sourceLocationId?: string;
  sourceLocationName?: string;
  destinationLocationId?: string;
  destinationLocationName?: string;
};
export type SaleItem = {
  id: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};
export type Sale = {
  id: string;
  paymentMethod: "cash" | "card";
  totalCents: number;
  createdAt: string;
  sellerName: string;
  locationName?: string;
  refundId?: string;
  refundNotes?: string;
  items: SaleItem[];
};
export type CashSession = {
  id: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt?: string;
  openingAmountCents: number;
  expectedCashAmountCents: number;
  countedCashAmountCents?: number;
  differenceCents?: number;
  sellerName: string;
  locationName?: string;
  totalOrders: number;
  netSalesCents: number;
  cashSalesCents: number;
  cardSalesCents: number;
  refundsCents: number;
};
export type FinancialMovement = {
  id: string;
  type: string;
  expenseType?: string;
  moneyLocation: string;
  amountCents: number;
  description: string;
  movementDate: string;
  notes?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  createdAt: string;
};
