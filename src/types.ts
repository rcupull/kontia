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
  id: string; name: string; taxId?: string; contactName?: string; email?: string;
  phone?: string; address?: string; city?: string; country?: string; notes?: string;
};

export type SupplierInvoice = {
  id: string; supplierId: string; supplierName: string; invoiceNumber: string;
  invoiceDate: string; totalAmountCents: number; notes?: string; batchCount: number;
};

export type Category = { id: string; name: string; createdAt: string; updatedAt: string };
export type Location = { id:string;code:string;name:string;type:"warehouse"|"point_of_sale";address?:string;isActive:number;totalUnits:number };
export type LocationStock = { locationId:string;locationName:string;locationType:"warehouse"|"point_of_sale";quantity:number };

export type InventoryBatch = { id: string; productId: string; productName: string;
  supplierInvoiceId?: string; invoiceNumber?: string; supplierName?: string;
  initialQuantity: number; totalQuantity:number; locationStocks:LocationStock[];
  unitCostCents: number; cashPriceCents: number; cardPriceCents: number; receivedAt: string };
export type InventoryMovement = { id: string; productId: string; productName: string; batchId: string;
  movementType: string; quantity: number; notes?: string; createdAt: string;
  sourceLocationId?:string;sourceLocationName?:string;destinationLocationId?:string;destinationLocationName?:string };
