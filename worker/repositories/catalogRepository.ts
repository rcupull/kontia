export type CreateCatalogProduct = {
  businessId: string;
  userId: string;
  name: string;
  sku: string;
  description: string;
  categoryId: string | null;
  imageId: string | null;
  type: "basic" | "composite";
  initialStock: number;
  unitCostCents: number;
  cashPriceCents: number;
  cardPriceCents: number;
  lowStockThreshold: number;
};

export type StockBatch = {
  id: string;
  warehouseQuantity: number;
  posQuantity: number;
};

export class CatalogRepository {
  constructor(private readonly db: D1Database) {}

  async listProducts(businessId: string) {
    const result = await this.db.prepare(`
      SELECT
        p.id, p.sku, p.name, p.description, p.type,
        p.category_id AS categoryId, c.name AS categoryName,
        p.image_id AS imageId, p.is_active AS isActive,
        p.low_stock_threshold AS lowStockThreshold,
        COALESCE(SUM(CASE WHEN b.deleted_at IS NULL THEN b.warehouse_quantity ELSE 0 END), 0) AS warehouseStock,
        COALESCE(SUM(CASE WHEN b.deleted_at IS NULL THEN b.pos_quantity ELSE 0 END), 0) AS posStock,
        COALESCE(SUM(CASE WHEN b.deleted_at IS NULL THEN b.warehouse_quantity + b.pos_quantity ELSE 0 END), 0) AS currentStock,
        COALESCE(
          (SELECT pb.cash_price_cents FROM inventory_batches pb
           WHERE pb.business_id = p.business_id AND pb.product_id = p.id
             AND pb.deleted_at IS NULL AND pb.pos_quantity > 0
           ORDER BY pb.received_at ASC, pb.id ASC LIMIT 1),
          (SELECT wb.cash_price_cents FROM inventory_batches wb
           WHERE wb.business_id = p.business_id AND wb.product_id = p.id
             AND wb.deleted_at IS NULL
           ORDER BY CASE WHEN wb.warehouse_quantity > 0 THEN 0 ELSE 1 END,
                    wb.received_at ASC, wb.id ASC LIMIT 1), 0
        ) AS cashPriceCents,
        COALESCE(
          (SELECT pb.card_price_cents FROM inventory_batches pb
           WHERE pb.business_id = p.business_id AND pb.product_id = p.id
             AND pb.deleted_at IS NULL AND pb.pos_quantity > 0
           ORDER BY pb.received_at ASC, pb.id ASC LIMIT 1),
          (SELECT wb.card_price_cents FROM inventory_batches wb
           WHERE wb.business_id = p.business_id AND wb.product_id = p.id
             AND wb.deleted_at IS NULL
           ORDER BY CASE WHEN wb.warehouse_quantity > 0 THEN 0 ELSE 1 END,
                    wb.received_at ASC, wb.id ASC LIMIT 1), 0
        ) AS cardPriceCents
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id AND c.business_id = p.business_id
      LEFT JOIN inventory_batches b ON b.product_id = p.id AND b.business_id = p.business_id
      WHERE p.business_id = ? AND p.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY p.name
    `).bind(businessId).all();
    return result.results;
  }

  async createProduct(input: CreateCatalogProduct) {
    const productId = crypto.randomUUID();
    const batchId = crypto.randomUUID();
    const now = new Date().toISOString();
    const statements = [
      this.db.prepare(`INSERT INTO products
        (id, business_id, category_id, image_id, sku, name, description, type,
         sale_price_cents, current_stock, low_stock_threshold)
        VALUES (?, ?, ?, ?, NULLIF(?, ''), ?, ?, ?, 0, 0, ?)`)
        .bind(productId, input.businessId, input.categoryId, input.imageId, input.sku,
          input.name, input.description, input.type, input.lowStockThreshold),
      this.db.prepare(`INSERT INTO inventory_batches
        (id, business_id, product_id, initial_quantity, warehouse_quantity, pos_quantity,
         unit_cost_cents, cash_price_cents, card_price_cents, received_at, created_by_user_id)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`)
        .bind(batchId, input.businessId, productId, input.initialStock, input.initialStock,
          input.unitCostCents, input.cashPriceCents, input.cardPriceCents, now, input.userId),
    ];
    if (input.initialStock > 0) {
      statements.push(this.db.prepare(`INSERT INTO inventory_movements
        (id, business_id, product_id, batch_id, movement_type, quantity, notes, created_by_user_id)
        VALUES (?, ?, ?, ?, 'inventoryInjection', ?, 'Existencia inicial', ?)`)
        .bind(crypto.randomUUID(), input.businessId, productId, batchId, input.initialStock, input.userId));
    }
    await this.db.batch(statements);
    return { id: productId, batchId };
  }

  async getBatchesWithWarehouseStock(businessId: string, productId: string): Promise<StockBatch[]> {
    const result = await this.db.prepare(`SELECT id,
        warehouse_quantity AS warehouseQuantity, pos_quantity AS posQuantity
      FROM inventory_batches
      WHERE business_id = ? AND product_id = ? AND deleted_at IS NULL
      ORDER BY received_at ASC, id ASC`).bind(businessId, productId).all<StockBatch>();
    return result.results;
  }

  async adjustWarehouseStock(input: {
    businessId: string; productId: string; userId: string; quantityDelta: number; reason: string;
  }) {
    const batches = await this.getBatchesWithWarehouseStock(input.businessId, input.productId);
    if (batches.length === 0) return null;
    const statements: D1PreparedStatement[] = [];
    if (input.quantityDelta > 0) {
      const batch = batches.at(-1)!;
      statements.push(
        this.db.prepare(`UPDATE inventory_batches SET warehouse_quantity = warehouse_quantity + ?,
          updated_at = datetime('now') WHERE id = ? AND business_id = ?`)
          .bind(input.quantityDelta, batch.id, input.businessId),
        this.movementStatement(input, batch.id, "positiveAdjustment", input.quantityDelta),
      );
    } else {
      let remaining = Math.abs(input.quantityDelta);
      for (const batch of batches) {
        if (remaining <= 0) break;
        const quantity = Math.min(Number(batch.warehouseQuantity), remaining);
        if (quantity <= 0) continue;
        statements.push(
          this.db.prepare(`UPDATE inventory_batches SET warehouse_quantity = warehouse_quantity - ?,
            updated_at = datetime('now') WHERE id = ? AND business_id = ?`)
            .bind(quantity, batch.id, input.businessId),
          this.movementStatement(input, batch.id, "negativeAdjustment", quantity),
        );
        remaining -= quantity;
      }
      if (remaining > 0) throw new Error("INSUFFICIENT_WAREHOUSE_STOCK");
    }
    await this.db.batch(statements);
    return true;
  }

  private movementStatement(
    input: { businessId: string; productId: string; userId: string; reason: string },
    batchId: string,
    movementType: "positiveAdjustment" | "negativeAdjustment",
    quantity: number,
  ) {
    return this.db.prepare(`INSERT INTO inventory_movements
      (id, business_id, product_id, batch_id, movement_type, quantity, notes, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), input.businessId, input.productId, batchId,
        movementType, quantity, input.reason, input.userId);
  }

  async listMovements(businessId: string, productId: string) {
    const result = await this.db.prepare(`SELECT id, batch_id AS batchId,
        movement_type AS movementType, quantity, notes,
        created_by_user_id AS createdByUserId, created_at AS createdAt
      FROM inventory_movements
      WHERE business_id = ? AND product_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC LIMIT 100`)
      .bind(businessId, productId).all();
    return result.results;
  }
}
