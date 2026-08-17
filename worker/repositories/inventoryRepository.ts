export type MovementType = "purchase" | "customerReturn" | "production" | "inventoryInjection" |
  "positiveAdjustment" | "internalConsumption" | "ownerWithdrawal" | "waste" | "posWaste" |
  "negativeAdjustment" | "transferToPos" | "transferToWarehouse" | "transformation" |
  "disassembly" | "disassemblyReturn";

export type CreateMovementInput = {
  businessId: string; userId: string; productId: string; batchId?: string;
  movementType: MovementType; quantity: number; unitCostCents?: number;
  cashPriceCents?: number; cardPriceCents?: number; supplierInvoiceId?: string; notes?: string;
};

type BatchRow = { id: string; productId: string; warehouseQuantity: number; posQuantity: number };

export class InventoryRepository {
  constructor(private readonly db: D1Database) {}

  async listBatches(businessId: string, search = "") {
    const term = `%${search.trim()}%`;
    const result = await this.db.prepare(`SELECT b.id, b.product_id AS productId, p.name AS productName,
        b.supplier_invoice_id AS supplierInvoiceId, i.invoice_number AS invoiceNumber,
        s.name AS supplierName, b.initial_quantity AS initialQuantity,
        b.warehouse_quantity AS warehouseQuantity, b.pos_quantity AS posQuantity,
        b.unit_cost_cents AS unitCostCents, b.cash_price_cents AS cashPriceCents,
        b.card_price_cents AS cardPriceCents, b.received_at AS receivedAt
      FROM inventory_batches b JOIN products p ON p.id = b.product_id AND p.business_id = b.business_id
      LEFT JOIN supplier_invoices i ON i.id = b.supplier_invoice_id AND i.business_id = b.business_id
      LEFT JOIN suppliers s ON s.id = i.supplier_id AND s.business_id = b.business_id
      WHERE b.business_id = ? AND b.deleted_at IS NULL
        AND (? = '%%' OR p.name LIKE ? COLLATE NOCASE OR i.invoice_number LIKE ? COLLATE NOCASE OR s.name LIKE ? COLLATE NOCASE)
      ORDER BY b.received_at DESC, b.id DESC`).bind(businessId, term, term, term, term).all();
    return result.results;
  }

  async listMovements(businessId: string, search = "") {
    const term = `%${search.trim()}%`;
    const result = await this.db.prepare(`SELECT m.id, m.product_id AS productId, p.name AS productName,
        m.batch_id AS batchId, m.movement_type AS movementType, m.quantity, m.notes,
        m.created_at AS createdAt, b.warehouse_quantity AS currentWarehouseQuantity,
        b.pos_quantity AS currentPosQuantity
      FROM inventory_movements m JOIN products p ON p.id = m.product_id AND p.business_id = m.business_id
      JOIN inventory_batches b ON b.id = m.batch_id AND b.business_id = m.business_id
      WHERE m.business_id = ? AND m.deleted_at IS NULL
        AND (? = '%%' OR p.name LIKE ? COLLATE NOCASE OR m.movement_type LIKE ? COLLATE NOCASE OR m.notes LIKE ? COLLATE NOCASE)
      ORDER BY m.created_at DESC, m.id DESC LIMIT 500`).bind(businessId, term, term, term, term).all();
    return result.results;
  }

  private async product(businessId: string, productId: string) {
    return this.db.prepare(`SELECT id, type FROM products WHERE id = ? AND business_id = ?
      AND deleted_at IS NULL AND is_active = 1`).bind(productId, businessId).first<{ id: string; type: string }>();
  }

  private async batch(businessId: string, batchId: string, productId?: string) {
    return this.db.prepare(`SELECT id, product_id AS productId, warehouse_quantity AS warehouseQuantity,
      pos_quantity AS posQuantity FROM inventory_batches WHERE id = ? AND business_id = ?
      AND deleted_at IS NULL ${productId ? "AND product_id = ?" : ""}`)
      .bind(...(productId ? [batchId, businessId, productId] : [batchId, businessId])).first<BatchRow>();
  }

  async createMovement(input: CreateMovementInput) {
    const product = await this.product(input.businessId, input.productId);
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    if (input.movementType === "production") return this.produce(input, product.type);
    if (input.movementType === "disassembly") return this.disassemble(input, product.type);
    if (["purchase", "inventoryInjection"].includes(input.movementType)) return this.createBatch(input);
    if (!input.batchId) throw new Error("BATCH_REQUIRED");
    const batch = await this.batch(input.businessId, input.batchId, input.productId);
    if (!batch) throw new Error("BATCH_NOT_FOUND");
    const next = this.quantitiesAfter(batch, input.movementType, input.quantity);
    if (next.warehouse < 0 || next.pos < 0) throw new Error("NEGATIVE_STOCK");
    const movementId = crypto.randomUUID();
    await this.db.batch([
      this.db.prepare(`UPDATE inventory_batches SET warehouse_quantity = ?, pos_quantity = ?,
        updated_at = datetime('now') WHERE id = ? AND business_id = ?`)
        .bind(next.warehouse, next.pos, batch.id, input.businessId),
      this.movement(input, movementId, batch.id),
      this.audit(input, movementId, { previousWarehouse: batch.warehouseQuantity,
        previousPos: batch.posQuantity, warehouse: next.warehouse, pos: next.pos }),
    ]);
    return { id: movementId, batchId: batch.id };
  }

  private async createBatch(input: CreateMovementInput) {
    if (input.unitCostCents == null || input.cashPriceCents == null || input.cardPriceCents == null)
      throw new Error("BATCH_PRICES_REQUIRED");
    const batchId = crypto.randomUUID(); const movementId = crypto.randomUUID();
    if (input.supplierInvoiceId) {
      const invoice = await this.db.prepare(`SELECT id FROM supplier_invoices WHERE id = ? AND business_id = ? AND deleted_at IS NULL`)
        .bind(input.supplierInvoiceId, input.businessId).first();
      if (!invoice) throw new Error("INVOICE_NOT_FOUND");
    }
    await this.db.batch([
      this.db.prepare(`INSERT INTO inventory_batches (id, business_id, product_id, supplier_invoice_id,
        initial_quantity, warehouse_quantity, pos_quantity, unit_cost_cents, cash_price_cents,
        card_price_cents, received_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`)
        .bind(batchId, input.businessId, input.productId, input.supplierInvoiceId ?? null,
          input.quantity, input.quantity, input.unitCostCents, input.cashPriceCents,
          input.cardPriceCents, new Date().toISOString(), input.userId),
      this.movement(input, movementId, batchId),
      this.audit(input, movementId, { batchId }),
    ]);
    return { id: movementId, batchId };
  }

  private async produce(input: CreateMovementInput, productType: string) {
    if (productType !== "composite") throw new Error("COMPOSITE_REQUIRED");
    if (!Number.isInteger(input.quantity)) throw new Error("INTEGER_QUANTITY_REQUIRED");
    if (input.unitCostCents == null || input.cashPriceCents == null || input.cardPriceCents == null)
      throw new Error("BATCH_PRICES_REQUIRED");
    const components = await this.db.prepare(`SELECT component_product_id AS productId, quantity
      FROM product_components WHERE business_id = ? AND parent_product_id = ? AND deleted_at IS NULL`)
      .bind(input.businessId, input.productId).all<{ productId: string; quantity: number }>();
    if (components.results.length === 0) throw new Error("COMPOSITION_REQUIRED");
    const outputBatchId = crypto.randomUUID(); const movementId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [this.db.prepare(`INSERT INTO inventory_batches
      (id, business_id, product_id, initial_quantity, warehouse_quantity, pos_quantity, unit_cost_cents,
       cash_price_cents, card_price_cents, received_at, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`)
      .bind(outputBatchId, input.businessId, input.productId, input.quantity, input.quantity,
        input.unitCostCents, input.cashPriceCents, input.cardPriceCents, new Date().toISOString(), input.userId)];
    for (const component of components.results) {
      let remaining = Number(component.quantity) * input.quantity;
      const batches = await this.db.prepare(`SELECT id, warehouse_quantity AS warehouseQuantity
        FROM inventory_batches WHERE business_id = ? AND product_id = ? AND deleted_at IS NULL
        AND warehouse_quantity > 0 ORDER BY received_at ASC, id ASC`)
        .bind(input.businessId, component.productId).all<{ id: string; warehouseQuantity: number }>();
      for (const batch of batches.results) {
        if (remaining <= 0) break; const quantity = Math.min(remaining, Number(batch.warehouseQuantity));
        statements.push(this.db.prepare(`UPDATE inventory_batches SET warehouse_quantity = warehouse_quantity - ?,
          updated_at = datetime('now') WHERE id = ? AND business_id = ?`).bind(quantity, batch.id, input.businessId));
        statements.push(this.db.prepare(`INSERT INTO inventory_movements
          (id, business_id, product_id, batch_id, production_batch_id, movement_type, quantity, notes, created_by_user_id)
          VALUES (?, ?, ?, ?, ?, 'transformation', ?, ?, ?)`)
          .bind(crypto.randomUUID(), input.businessId, component.productId, batch.id, outputBatchId,
            quantity, input.notes ?? "Producción de producto compuesto", input.userId));
        remaining -= quantity;
      }
      if (remaining > 0) throw new Error("INSUFFICIENT_COMPONENT_STOCK");
    }
    statements.push(this.movement(input, movementId, outputBatchId), this.audit(input, movementId, { outputBatchId }));
    await this.db.batch(statements); return { id: movementId, batchId: outputBatchId };
  }

  private async disassemble(input: CreateMovementInput, productType: string) {
    if (productType !== "composite") throw new Error("COMPOSITE_REQUIRED");
    if (!Number.isInteger(input.quantity)) throw new Error("INTEGER_QUANTITY_REQUIRED");
    if (!input.batchId) throw new Error("BATCH_REQUIRED");
    const output = await this.batch(input.businessId, input.batchId, input.productId);
    if (!output) throw new Error("BATCH_NOT_FOUND");
    if (output.warehouseQuantity < input.quantity) throw new Error("NEGATIVE_STOCK");
    const production = await this.db.prepare(`SELECT quantity FROM inventory_movements
      WHERE business_id = ? AND batch_id = ? AND movement_type = 'production' AND deleted_at IS NULL LIMIT 1`)
      .bind(input.businessId, output.id).first<{ quantity: number }>();
    if (!production) throw new Error("PRODUCTION_NOT_FOUND");
    const consumed = await this.db.prepare(`SELECT product_id AS productId, batch_id AS batchId, quantity
      FROM inventory_movements WHERE business_id = ? AND production_batch_id = ?
      AND movement_type = 'transformation' AND deleted_at IS NULL`)
      .bind(input.businessId, output.id).all<{ productId: string; batchId: string; quantity: number }>();
    const movementId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`UPDATE inventory_batches SET warehouse_quantity = warehouse_quantity - ?, updated_at = datetime('now')
        WHERE id = ? AND business_id = ?`).bind(input.quantity, output.id, input.businessId),
      this.movement(input, movementId, output.id),
    ];
    for (const item of consumed.results) {
      const returned = Number(item.quantity) * input.quantity / Number(production.quantity);
      statements.push(this.db.prepare(`UPDATE inventory_batches SET warehouse_quantity = warehouse_quantity + ?,
        updated_at = datetime('now') WHERE id = ? AND business_id = ?`).bind(returned, item.batchId, input.businessId));
      statements.push(this.db.prepare(`INSERT INTO inventory_movements
        (id, business_id, product_id, batch_id, production_batch_id, movement_type, quantity, notes, created_by_user_id)
        VALUES (?, ?, ?, ?, ?, 'disassemblyReturn', ?, ?, ?)`)
        .bind(crypto.randomUUID(), input.businessId, item.productId, item.batchId, output.id,
          returned, input.notes ?? "Retorno por desarme", input.userId));
    }
    statements.push(this.audit(input, movementId, { outputBatchId: output.id }));
    await this.db.batch(statements); return { id: movementId, batchId: output.id };
  }

  private quantitiesAfter(batch: BatchRow, type: MovementType, quantity: number) {
    let warehouse = Number(batch.warehouseQuantity); let pos = Number(batch.posQuantity);
    if (["positiveAdjustment", "customerReturn"].includes(type)) type === "customerReturn" ? pos += quantity : warehouse += quantity;
    else if (["internalConsumption", "ownerWithdrawal", "waste", "negativeAdjustment", "transformation"].includes(type)) warehouse -= quantity;
    else if (type === "posWaste") pos -= quantity;
    else if (type === "transferToPos") { warehouse -= quantity; pos += quantity; }
    else if (type === "transferToWarehouse") { warehouse += quantity; pos -= quantity; }
    else throw new Error("INVALID_MOVEMENT_TYPE");
    return { warehouse, pos };
  }

  private movement(input: CreateMovementInput, id: string, batchId: string) {
    return this.db.prepare(`INSERT INTO inventory_movements
      (id, business_id, product_id, batch_id, movement_type, quantity, notes, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, NULLIF(?, ''), ?)`)
      .bind(id, input.businessId, input.productId, batchId, input.movementType,
        input.quantity, input.notes ?? "", input.userId);
  }

  private audit(input: CreateMovementInput, entityId: string, metadata: object) {
    return this.db.prepare(`INSERT INTO audit_logs
      (id, business_id, entity_type, entity_id, action, description, metadata, created_by_user_id)
      VALUES (?, ?, 'inventoryMovement', ?, 'create', 'Movimiento de inventario manual', ?, ?)`)
      .bind(crypto.randomUUID(), input.businessId, entityId, JSON.stringify({
        movementType: input.movementType, productId: input.productId, quantity: input.quantity, ...metadata }), input.userId);
  }
}
