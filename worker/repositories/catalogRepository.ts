export type CreateCatalogProduct = {
  businessId: string;
  userId: string;
  name: string;
  description: string;
  categoryId: string | null;
  imageId: string | null;
  type: "basic" | "composite";
};

export type StockBatch = {
  id: string;
  quantity: number;
};

export class CatalogRepository {
  constructor(private readonly db: D1Database) {}

  async listProducts(businessId: string) {
    const result = await this.db.prepare(`
      SELECT
        p.id, p.sku, p.name, p.description, p.type,
        p.category_id AS categoryId, c.name AS categoryName,
        p.image_id AS imageId, p.is_active AS isActive,
        COALESCE(SUM(CASE WHEN b.deleted_at IS NULL AND l.type='warehouse' THEN bs.quantity ELSE 0 END), 0) AS warehouseStock,
        COALESCE(SUM(CASE WHEN b.deleted_at IS NULL AND l.type='point_of_sale' THEN bs.quantity ELSE 0 END), 0) AS posStock,
        COALESCE(SUM(CASE WHEN b.deleted_at IS NULL THEN bs.quantity ELSE 0 END), 0) AS currentStock,
        COALESCE(
          (SELECT pb.cash_price_cents FROM inventory_batches pb JOIN inventory_batch_stocks pbs ON pbs.batch_id=pb.id JOIN locations pl ON pl.id=pbs.location_id
           WHERE pb.business_id = p.business_id AND pb.product_id = p.id
             AND pb.deleted_at IS NULL AND pbs.quantity > 0 AND pl.type='point_of_sale'
           ORDER BY pb.received_at ASC, pb.id ASC LIMIT 1),
          (SELECT wb.cash_price_cents FROM inventory_batches wb LEFT JOIN inventory_batch_stocks wbs ON wbs.batch_id=wb.id
           WHERE wb.business_id = p.business_id AND wb.product_id = p.id
             AND wb.deleted_at IS NULL
           GROUP BY wb.id ORDER BY CASE WHEN COALESCE(SUM(wbs.quantity),0)>0 THEN 0 ELSE 1 END,
                    wb.received_at ASC, wb.id ASC LIMIT 1), 0
        ) AS cashPriceCents,
        COALESCE(
          (SELECT pb.card_price_cents FROM inventory_batches pb JOIN inventory_batch_stocks pbs ON pbs.batch_id=pb.id JOIN locations pl ON pl.id=pbs.location_id
           WHERE pb.business_id = p.business_id AND pb.product_id = p.id
             AND pb.deleted_at IS NULL AND pbs.quantity > 0 AND pl.type='point_of_sale'
           ORDER BY pb.received_at ASC, pb.id ASC LIMIT 1),
          (SELECT wb.card_price_cents FROM inventory_batches wb LEFT JOIN inventory_batch_stocks wbs ON wbs.batch_id=wb.id
           WHERE wb.business_id = p.business_id AND wb.product_id = p.id
             AND wb.deleted_at IS NULL
           GROUP BY wb.id ORDER BY CASE WHEN COALESCE(SUM(wbs.quantity),0)>0 THEN 0 ELSE 1 END,
                    wb.received_at ASC, wb.id ASC LIMIT 1), 0
        ) AS cardPriceCents
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id AND c.business_id = p.business_id
      LEFT JOIN inventory_batches b ON b.product_id = p.id AND b.business_id = p.business_id
      LEFT JOIN inventory_batch_stocks bs ON bs.batch_id=b.id AND bs.business_id=p.business_id
      LEFT JOIN locations l ON l.id=bs.location_id AND l.business_id=p.business_id
      WHERE p.business_id = ? AND p.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY p.name
    `).bind(businessId).all();
    return result.results;
  }

  async createProduct(input: CreateCatalogProduct) {
    const productId = crypto.randomUUID();
    await this.db.prepare(`INSERT INTO products
      (id, business_id, category_id, image_id, name, description, type)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(productId, input.businessId, input.categoryId, input.imageId,
        input.name, input.description, input.type).run();
    return { id: productId };
  }

  async updateProduct(businessId: string, id: string, input: Omit<CreateCatalogProduct, "businessId" | "userId">) {
    const result = await this.db.prepare(`UPDATE products SET category_id = ?, image_id = ?,
        name = ?, description = ?, type = ?, updated_at = datetime('now')
      WHERE id = ? AND business_id = ? AND deleted_at IS NULL`)
      .bind(input.categoryId, input.imageId, input.name, input.description, input.type, id, businessId).run();
    return Number(result.meta.changes) > 0;
  }

  async setProductActive(businessId: string, id: string, isActive: boolean) {
    const result = await this.db.prepare(`UPDATE products SET is_active = ?, updated_at = datetime('now')
      WHERE id = ? AND business_id = ? AND deleted_at IS NULL`)
      .bind(isActive ? 1 : 0, id, businessId).run();
    return Number(result.meta.changes) > 0;
  }

  async getBatchesWithStock(businessId: string, productId: string, locationId:string): Promise<StockBatch[]> {
    const result = await this.db.prepare(`SELECT b.id,s.quantity FROM inventory_batches b
      JOIN inventory_batch_stocks s ON s.batch_id=b.id AND s.location_id=?
      WHERE b.business_id = ? AND b.product_id = ? AND b.deleted_at IS NULL
      ORDER BY b.received_at ASC, b.id ASC`).bind(locationId,businessId, productId).all<StockBatch>();
    return result.results;
  }

  async adjustWarehouseStock(input: {
    businessId: string; productId: string; userId: string; locationId:string; quantityDelta: number; reason: string;
  }) {
    const batches = await this.getBatchesWithStock(input.businessId, input.productId,input.locationId);
    if (batches.length === 0) return null;
    const statements: D1PreparedStatement[] = [];
    if (input.quantityDelta > 0) {
      const batch = batches.at(-1)!;
      statements.push(
        this.db.prepare(`UPDATE inventory_batch_stocks SET quantity=quantity+?,updated_at=datetime('now') WHERE batch_id=? AND location_id=? AND business_id=?`)
          .bind(input.quantityDelta,batch.id,input.locationId,input.businessId),
        this.movementStatement(input, batch.id, "positiveAdjustment", input.quantityDelta),
      );
    } else {
      let remaining = Math.abs(input.quantityDelta);
      for (const batch of batches) {
        if (remaining <= 0) break;
        const quantity = Math.min(Number(batch.quantity), remaining);
        if (quantity <= 0) continue;
        statements.push(
          this.db.prepare(`UPDATE inventory_batch_stocks SET quantity=quantity-?,updated_at=datetime('now') WHERE batch_id=? AND location_id=? AND business_id=? AND quantity>=?`)
            .bind(quantity,batch.id,input.locationId,input.businessId,quantity),
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
    input: { businessId: string; productId: string; userId: string; locationId:string; reason: string },
    batchId: string,
    movementType: "positiveAdjustment" | "negativeAdjustment",
    quantity: number,
  ) {
    return this.db.prepare(`INSERT INTO inventory_movements
      (id,business_id,product_id,batch_id,source_location_id,destination_location_id,movement_type,quantity,notes,created_by_user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), input.businessId, input.productId, batchId,
        movementType==="negativeAdjustment"?input.locationId:null,movementType==="positiveAdjustment"?input.locationId:null,movementType,quantity,input.reason,input.userId);
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
