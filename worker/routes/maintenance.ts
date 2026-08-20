import { Hono } from "hono";
import type { Bindings, Variables } from "../types";

type LegacyRow = Record<string, unknown>;
type ImportPayload = {
  mode: "replace" | "append";
  business: LegacyRow;
  categories: LegacyRow[];
  products: LegacyRow[];
  productComponents: LegacyRow[];
  suppliers: LegacyRow[];
  supplierInvoices: LegacyRow[];
  inventoryBatches: LegacyRow[];
  inventoryMovements: LegacyRow[];
  cashSessions: LegacyRow[];
  sales: LegacyRow[];
  saleItems: LegacyRow[];
  saleRefunds: LegacyRow[];
  financialMovements: LegacyRow[];
  auditLogs: LegacyRow[];
};

export const maintenanceRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

const sourceBusinessId = "46803d79-afbc-4606-8636-836af5469593";
const text = (value: unknown) => (value == null ? null : String(value));
const number = (value: unknown) => Number(value ?? 0);
const cents = (value: unknown) => Math.round(number(value) * 100);
const requiredTables: Array<keyof Omit<ImportPayload, "business">> = [
  "categories",
  "products",
  "productComponents",
  "suppliers",
  "supplierInvoices",
  "inventoryBatches",
  "inventoryMovements",
  "cashSessions",
  "sales",
  "saleItems",
  "saleRefunds",
  "financialMovements",
  "auditLogs",
];

function decodeBase64(value: unknown) {
  const binary = atob(String(value ?? ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function executeInChunks(
  db: D1Database,
  statements: D1PreparedStatement[],
) {
  for (let index = 0; index < statements.length; index += 75)
    await db.batch(statements.slice(index, index + 75));
}

maintenanceRoutes.post("/reset-operations", async (c) => {
  const user = c.get("sessionUser");
  if (user.role !== "owner")
    return c.json(
      { error: "Solo el propietario puede reiniciar las operaciones" },
      403,
    );
  const payload = (await c.req.json().catch(() => null)) as {
    confirmation?: string;
  } | null;
  if (payload?.confirmation !== "REINICIAR OPERACIONES")
    return c.json(
      { error: "Escribe REINICIAR OPERACIONES para confirmar" },
      400,
    );

  const tables = [
    "audit_logs",
    "financial_movements",
    "inventory_movements",
    "sale_refunds",
    "sale_items",
    "sales",
    "cash_sessions",
    "inventory_batch_stocks",
    "inventory_batches",
    "supplier_invoices",
  ] as const;
  const results = await c.env.DB.batch(
    tables.map((table) =>
      c.env.DB.prepare(`DELETE FROM ${table} WHERE business_id=?`).bind(
        user.businessId,
      ),
    ),
  );
  return c.json({
    ok: true,
    deleted: Object.fromEntries(
      tables.map((table, index) => [
        table,
        Number(results[index]?.meta.changes ?? 0),
      ]),
    ),
  });
});

maintenanceRoutes.post("/import-litepos", async (c) => {
  const user = c.get("sessionUser");
  if (user.role !== "owner")
    return c.json({ error: "Solo el propietario puede importar datos" }, 403);

  const payload = (await c.req.json()) as ImportPayload;
  if (
    !payload ||
    !["replace", "append"].includes(payload.mode) ||
    text(payload.business?.id) !== sourceBusinessId ||
    requiredTables.some((table) => !Array.isArray(payload[table]))
  )
    return c.json({ error: "El archivo no corresponde a Pos64" }, 400);

  const db = c.env.DB;
  const businessId = user.businessId;
  let warehouseId = "";
  let posId = "";
  let uncategorizedId = "";

  if (payload.mode === "replace") {
    warehouseId = crypto.randomUUID();
    posId = crypto.randomUUID();
    uncategorizedId = crypto.randomUUID();
    await executeInChunks(
      db,
      [
        "audit_logs",
        "financial_movements",
        "inventory_movements",
        "sale_refunds",
        "sale_items",
        "sales",
        "cash_sessions",
        "inventory_batch_stocks",
        "product_components",
        "inventory_batches",
        "supplier_invoices",
        "suppliers",
        "products",
        "images",
        "categories",
        "locations",
      ].map((table) =>
        db.prepare(`DELETE FROM ${table} WHERE business_id=?`).bind(businessId),
      ),
    );

    await db.batch([
      db
        .prepare(
          `UPDATE businesses SET name=?,currency=?,sales_tax_percentage=?,is_active=?,updated_at=datetime('now') WHERE id=?`,
        )
        .bind(
          text(payload.business.name) ?? "Pos64",
          text(payload.business.currency) ?? "CUP",
          number(payload.business.salesTaxPercentage),
          number(payload.business.isActive) ? 1 : 0,
          businessId,
        ),
      db
        .prepare(
          `INSERT INTO locations (id,business_id,code,name,type) VALUES (?,?,'ALM-01','Almacén principal','warehouse')`,
        )
        .bind(warehouseId, businessId),
      db
        .prepare(
          `INSERT INTO locations (id,business_id,code,name,type) VALUES (?,?,'POS-01','Punto de venta principal','point_of_sale')`,
        )
        .bind(posId, businessId),
      db
        .prepare(
          `INSERT INTO categories (id,business_id,name,created_at,updated_at) VALUES (?,?,'Sin categoría',datetime('now'),datetime('now'))`,
        )
        .bind(uncategorizedId, businessId),
    ]);
  } else {
    const warehouse = await db
      .prepare(
        `SELECT id FROM locations WHERE business_id=? AND code='ALM-01' AND deleted_at IS NULL`,
      )
      .bind(businessId)
      .first<{ id: string }>();
    const uncategorized = await db
      .prepare(
        `SELECT id FROM categories WHERE business_id=? AND name='Sin categoría' AND deleted_at IS NULL`,
      )
      .bind(businessId)
      .first<{ id: string }>();
    const pos = await db
      .prepare(
        `SELECT id FROM locations WHERE business_id=? AND code='POS-01' AND deleted_at IS NULL`,
      )
      .bind(businessId)
      .first<{ id: string }>();
    if (!warehouse || !pos || !uncategorized)
      return c.json({ error: "La importación no fue inicializada" }, 409);
    warehouseId = warehouse.id;
    posId = pos.id;
    uncategorizedId = uncategorized.id;
  }

  const statements: D1PreparedStatement[] = [];
  for (const row of payload.categories)
    statements.push(
      db
        .prepare(
          `INSERT INTO categories (id,business_id,name,icon,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?)`,
        )
        .bind(
          text(row.id),
          businessId,
          text(row.name),
          text(row.icon),
          text(row.createdAt),
          text(row.updatedAt),
          text(row.deletedAt),
        ),
    );
  for (const row of payload.products) {
    const imageId = text(row.imageBase64) ? `${text(row.id)}-image` : null;
    if (imageId)
      statements.push(
        db
          .prepare(
            `INSERT INTO images (id,business_id,content_type,data,size_bytes,created_at) VALUES (?,?,?,?,?,?)`,
          )
          .bind(
            imageId,
            businessId,
            text(row.imageContentType),
            decodeBase64(row.imageBase64),
            number(row.imageSizeBytes),
            text(row.createdAt),
          ),
      );
    statements.push(
      db
        .prepare(
          `INSERT INTO products (id,business_id,category_id,name,description,is_active,type,image_id,created_at,updated_at,deleted_at) VALUES (?,?,?,?,? ,?,?,?,?,?,?)`,
        )
        .bind(
          text(row.id),
          businessId,
          text(row.categoryId) || uncategorizedId,
          text(row.name),
          "",
          number(row.isActive) ? 1 : 0,
          text(row.type) === "composite" ? "composite" : "basic",
          imageId,
          text(row.createdAt),
          text(row.updatedAt),
          text(row.deletedAt),
        ),
    );
  }
  for (const row of payload.productComponents)
    statements.push(
      db
        .prepare(
          `INSERT INTO product_components (id,business_id,parent_product_id,component_product_id,quantity,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?)`,
        )
        .bind(
          text(row.id),
          businessId,
          text(row.parentProductId),
          text(row.componentProductId),
          number(row.quantity),
          text(row.createdAt),
          text(row.updatedAt),
          text(row.deletedAt),
        ),
    );
  for (const row of payload.suppliers)
    statements.push(
      db
        .prepare(
          `INSERT INTO suppliers (id,business_id,name,tax_id,contact_name,email,phone,address,city,country,notes,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          text(row.id),
          businessId,
          text(row.name),
          text(row.taxId),
          text(row.contactName),
          text(row.email),
          text(row.phone),
          text(row.address),
          text(row.city),
          text(row.country),
          text(row.notes),
          text(row.createdAt),
          text(row.updatedAt),
          text(row.deletedAt),
        ),
    );
  for (const row of payload.supplierInvoices)
    statements.push(
      db
        .prepare(
          `INSERT INTO supplier_invoices (id,business_id,supplier_id,invoice_number,invoice_date,total_amount_cents,notes,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          text(row.id),
          businessId,
          text(row.supplierId),
          text(row.invoiceNumber),
          text(row.invoiceDate),
          cents(row.totalAmount),
          text(row.notes),
          text(row.createdAt),
          text(row.updatedAt),
          text(row.deletedAt),
        ),
    );
  for (const row of payload.inventoryBatches) {
    statements.push(
      db
        .prepare(
          `INSERT INTO inventory_batches (id,business_id,product_id,supplier_invoice_id,initial_quantity,unit_cost_cents,cash_price_cents,card_price_cents,received_at,created_by_user_id,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          text(row.id),
          businessId,
          text(row.productId),
          text(row.supplierInvoiceId),
          number(row.initialQuantity),
          cents(row.unitCost),
          cents(row.cashPrice),
          cents(row.cardPrice),
          text(row.receivedAt),
          user.id,
          text(row.createdAt),
          text(row.updatedAt),
          text(row.deletedAt),
        ),
      db
        .prepare(
          `INSERT INTO inventory_batch_stocks (business_id,batch_id,location_id,quantity,updated_at) VALUES (?,?,?,?,?)`,
        )
        .bind(
          businessId,
          text(row.id),
          warehouseId,
          Math.max(0, number(row.warehouseQuantity) + number(row.posQuantity)),
          text(row.updatedAt),
        ),
    );
  }
  for (const row of payload.cashSessions)
    statements.push(
      db
        .prepare(
          `INSERT INTO cash_sessions (id,business_id,seller_id,opening_amount_cents,pos_snapshot,expected_cash_amount_cents,counted_cash_amount_cents,difference_cents,status,opened_at,closed_at,created_at,updated_at,deleted_at,location_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          text(row.id),
          businessId,
          user.id,
          cents(row.openingAmount),
          null,
          cents(row.expectedCashAmount),
          row.countedCashAmount == null ? null : cents(row.countedCashAmount),
          row.difference == null ? null : cents(row.difference),
          text(row.status) === "open" ? "closed" : text(row.status),
          text(row.openedAt),
          text(row.closedAt) ?? text(row.updatedAt),
          text(row.createdAt),
          text(row.updatedAt),
          text(row.deletedAt),
          posId,
        ),
    );
  for (const row of payload.sales)
    statements.push(
      db
        .prepare(
          `INSERT INTO sales (id,business_id,cash_session_id,seller_id,payment_method,total_cents,created_at,updated_at,deleted_at,location_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          text(row.id),
          businessId,
          text(row.cashSessionId),
          user.id,
          text(row.paymentMethod),
          cents(row.total),
          text(row.createdAt),
          text(row.updatedAt),
          text(row.deletedAt),
          posId,
        ),
    );
  for (const row of payload.saleItems)
    statements.push(
      db
        .prepare(
          `INSERT INTO sale_items (id,business_id,sale_id,product_id,product_name,batch_id,quantity,unit_price_cents,total_cents,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          text(row.id),
          businessId,
          text(row.saleId),
          text(row.productId),
          text(row.productName),
          text(row.batchId),
          number(row.quantity),
          cents(row.unitPrice),
          cents(row.total),
          text(row.createdAt),
          text(row.updatedAt),
          text(row.deletedAt),
        ),
    );
  for (const row of payload.saleRefunds)
    statements.push(
      db
        .prepare(
          `INSERT INTO sale_refunds (id,business_id,sale_id,created_by_user_id,notes,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?)`,
        )
        .bind(
          text(row.id),
          businessId,
          text(row.saleId),
          user.id,
          text(row.notes),
          text(row.createdAt),
          text(row.updatedAt),
          text(row.deletedAt),
        ),
    );
  for (const row of payload.inventoryMovements) {
    const legacyType = text(row.movementType);
    if (legacyType === "transferToPos" || legacyType === "transferToWarehouse")
      continue;
    const type = legacyType === "posWaste" ? "waste" : legacyType;
    const inbound = [
      "purchase",
      "customerReturn",
      "production",
      "inventoryInjection",
      "positiveAdjustment",
      "disassemblyReturn",
    ].includes(type ?? "");
    statements.push(
      db
        .prepare(
          `INSERT INTO inventory_movements (id,business_id,product_id,batch_id,source_location_id,destination_location_id,sale_id,sale_refund_id,production_batch_id,movement_type,quantity,notes,created_by_user_id,compensation_unit_cost_cents,compensation_total_cost_cents,compensation_payment_method,compensation_paid_at,compensation_paid_by_user_id,compensation_payment_notes,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          text(row.id),
          businessId,
          text(row.productId),
          text(row.batchId),
          inbound ? null : type === "sale" ? posId : warehouseId,
          inbound ? (type === "customerReturn" ? posId : warehouseId) : null,
          text(row.saleId),
          text(row.saleRefundId),
          text(row.productionBatchId),
          type,
          number(row.quantity),
          text(row.notes),
          user.id,
          row.compensationUnitCost == null
            ? null
            : cents(row.compensationUnitCost),
          row.compensationTotalCost == null
            ? null
            : cents(row.compensationTotalCost),
          text(row.compensationPaymentMethod),
          text(row.compensationPaidAt),
          row.compensationPaidByUserId == null ? null : user.id,
          text(row.compensationPaymentNotes),
          text(row.createdAt),
          text(row.updatedAt),
          text(row.deletedAt),
        ),
    );
  }
  for (const row of payload.financialMovements)
    statements.push(
      db
        .prepare(
          `INSERT INTO financial_movements (id,business_id,type,expense_type,money_location,amount_cents,description,movement_date,notes,related_entity_type,related_entity_id,created_by_user_id,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          text(row.id),
          businessId,
          text(row.type),
          text(row.expenseType),
          text(row.moneyLocation),
          cents(row.amount),
          text(row.description) ?? "",
          text(row.movementDate),
          text(row.notes),
          text(row.relatedEntityType),
          text(row.relatedEntityId),
          user.id,
          text(row.createdAt),
          text(row.updatedAt),
          text(row.deletedAt),
        ),
    );
  for (const row of payload.auditLogs)
    statements.push(
      db
        .prepare(
          `INSERT INTO audit_logs (id,business_id,entity_type,entity_id,action,description,metadata,created_by_user_id,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          text(row.id),
          businessId,
          text(row.entityType),
          text(row.entityId),
          text(row.action),
          text(row.description),
          text(row.metadata),
          user.id,
          text(row.createdAt),
          text(row.updatedAt),
          text(row.deletedAt),
        ),
    );

  await executeInChunks(db, statements);
  return c.json({
    ok: true,
    warehouseId,
    imported: {
      products: payload.products.length,
      batches: payload.inventoryBatches.length,
      movements: payload.inventoryMovements.filter(
        (row) =>
          !["transferToPos", "transferToWarehouse"].includes(
            String(row.movementType),
          ),
      ).length,
      sales: payload.sales.length,
      images: payload.products.filter((row) => row.imageBase64).length,
    },
  });
});
