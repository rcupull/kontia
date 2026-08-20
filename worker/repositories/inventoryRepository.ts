export type MovementType =
  | "purchase"
  | "customerReturn"
  | "production"
  | "inventoryInjection"
  | "positiveAdjustment"
  | "internalConsumption"
  | "ownerWithdrawal"
  | "waste"
  | "negativeAdjustment"
  | "transfer"
  | "transformation"
  | "disassembly"
  | "disassemblyReturn";

export type CreateMovementInput = {
  businessId: string;
  userId: string;
  productId: string;
  batchId?: string;
  sourceLocationId?: string;
  destinationLocationId?: string;
  movementType: MovementType;
  quantity: number;
  unitCostCents?: number;
  cashPriceCents?: number;
  cardPriceCents?: number;
  supplierInvoiceId?: string;
  receivedAt?: string;
  notes?: string;
};

export class InventoryRepository {
  constructor(private readonly db: D1Database) {}

  async updateBatch(
    businessId: string,
    batchId: string,
    input: {
      receivedAt: string;
      unitCostCents: number;
      cashPriceCents: number;
      cardPriceCents: number;
      supplierInvoiceId: string | null;
    },
  ) {
    if (
      input.supplierInvoiceId &&
      !(await this.db
        .prepare(
          `SELECT id FROM supplier_invoices WHERE id=? AND business_id=? AND deleted_at IS NULL`,
        )
        .bind(input.supplierInvoiceId, businessId)
        .first())
    )
      throw new Error("INVOICE_NOT_FOUND");
    const result = await this.db
      .prepare(
        `UPDATE inventory_batches SET received_at=?,unit_cost_cents=?,cash_price_cents=?,card_price_cents=?,supplier_invoice_id=?,updated_at=datetime('now') WHERE id=? AND business_id=? AND deleted_at IS NULL`,
      )
      .bind(
        input.receivedAt,
        input.unitCostCents,
        input.cashPriceCents,
        input.cardPriceCents,
        input.supplierInvoiceId,
        batchId,
        businessId,
      )
      .run();
    return Number(result.meta.changes) > 0;
  }

  async listBatches(businessId: string, search = "") {
    const term = `%${search.trim()}%`;
    const result = await this.db
      .prepare(
        `SELECT b.id,b.product_id AS productId,p.name AS productName,
      b.supplier_invoice_id AS supplierInvoiceId,i.invoice_number AS invoiceNumber,s.name AS supplierName,
      b.initial_quantity AS initialQuantity,b.unit_cost_cents AS unitCostCents,b.cash_price_cents AS cashPriceCents,
      b.card_price_cents AS cardPriceCents,b.received_at AS receivedAt,
      COALESCE((SELECT SUM(bs.quantity) FROM inventory_batch_stocks bs WHERE bs.batch_id=b.id),0) AS totalQuantity,
      COALESCE((SELECT json_group_array(json_object('locationId',x.location_id,'locationName',x.name,'locationType',x.type,'quantity',x.quantity))
        FROM (SELECT bs.location_id,l.name,l.type,bs.quantity FROM inventory_batch_stocks bs JOIN locations l ON l.id=bs.location_id
          WHERE bs.batch_id=b.id AND bs.quantity>0 ORDER BY l.name) x),'[]') AS locationStocks
      FROM inventory_batches b JOIN products p ON p.id=b.product_id AND p.business_id=b.business_id
      LEFT JOIN supplier_invoices i ON i.id=b.supplier_invoice_id LEFT JOIN suppliers s ON s.id=i.supplier_id
      WHERE b.business_id=? AND b.deleted_at IS NULL AND (?='%%' OR p.name LIKE ? COLLATE NOCASE OR i.invoice_number LIKE ? COLLATE NOCASE OR s.name LIKE ? COLLATE NOCASE)
      ORDER BY b.received_at DESC,b.id DESC`,
      )
      .bind(businessId, term, term, term, term)
      .all<Record<string, unknown>>();
    return result.results.map((row) => ({
      ...row,
      locationStocks: JSON.parse(String(row.locationStocks ?? "[]")),
    }));
  }

  async listMovements(businessId: string, search = "") {
    const term = `%${search.trim()}%`;
    const result = await this.db
      .prepare(
        `SELECT m.id,m.product_id AS productId,p.name AS productName,m.batch_id AS batchId,
      m.movement_type AS movementType,m.quantity,m.notes,m.created_at AS createdAt,
      m.source_location_id AS sourceLocationId,sl.name AS sourceLocationName,
      m.destination_location_id AS destinationLocationId,dl.name AS destinationLocationName
      FROM inventory_movements m JOIN products p ON p.id=m.product_id AND p.business_id=m.business_id
      LEFT JOIN locations sl ON sl.id=m.source_location_id LEFT JOIN locations dl ON dl.id=m.destination_location_id
      WHERE m.business_id=? AND m.deleted_at IS NULL AND (?='%%' OR p.name LIKE ? COLLATE NOCASE OR m.movement_type LIKE ? COLLATE NOCASE OR sl.name LIKE ? COLLATE NOCASE OR dl.name LIKE ? COLLATE NOCASE OR m.notes LIKE ? COLLATE NOCASE)
      ORDER BY m.created_at DESC,m.id DESC LIMIT 500`,
      )
      .bind(businessId, term, term, term, term, term, term)
      .all();
    return result.results;
  }

  private async product(input: CreateMovementInput) {
    return this.db
      .prepare(
        `SELECT id,type FROM products WHERE id=? AND business_id=? AND deleted_at IS NULL AND is_active=1`,
      )
      .bind(input.productId, input.businessId)
      .first<{ id: string; type: string }>();
  }
  private async batch(input: CreateMovementInput) {
    return input.batchId
      ? this.db
          .prepare(
            `SELECT id,product_id AS productId FROM inventory_batches WHERE id=? AND product_id=? AND business_id=? AND deleted_at IS NULL`,
          )
          .bind(input.batchId, input.productId, input.businessId)
          .first<{ id: string; productId: string }>()
      : null;
  }
  private async location(businessId: string, id?: string) {
    return id
      ? this.db
          .prepare(
            `SELECT id FROM locations WHERE id=? AND business_id=? AND is_active=1 AND deleted_at IS NULL`,
          )
          .bind(id, businessId)
          .first()
      : null;
  }
  private async stock(businessId: string, batchId: string, locationId: string) {
    const row = await this.db
      .prepare(
        `SELECT quantity FROM inventory_batch_stocks WHERE business_id=? AND batch_id=? AND location_id=?`,
      )
      .bind(businessId, batchId, locationId)
      .first<{ quantity: number }>();
    return Number(row?.quantity ?? 0);
  }
  private addStock(
    businessId: string,
    batchId: string,
    locationId: string,
    quantity: number,
  ) {
    return this.db
      .prepare(
        `INSERT INTO inventory_batch_stocks (business_id,batch_id,location_id,quantity) VALUES (?,?,?,?) ON CONFLICT(batch_id,location_id) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=datetime('now')`,
      )
      .bind(businessId, batchId, locationId, quantity);
  }
  private subtractStock(
    businessId: string,
    batchId: string,
    locationId: string,
    quantity: number,
  ) {
    return this.db
      .prepare(
        `UPDATE inventory_batch_stocks SET quantity=quantity-?,updated_at=datetime('now') WHERE business_id=? AND batch_id=? AND location_id=? AND quantity>=?`,
      )
      .bind(quantity, businessId, batchId, locationId, quantity);
  }
  private movement(
    input: CreateMovementInput,
    id: string,
    batchId: string,
    type = input.movementType,
    source = input.sourceLocationId ?? null,
    destination = input.destinationLocationId ?? null,
    productionBatchId: string | null = null,
  ) {
    return this.db
      .prepare(
        `INSERT INTO inventory_movements (id,business_id,product_id,batch_id,source_location_id,destination_location_id,production_batch_id,movement_type,quantity,notes,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,NULLIF(?,''),?)`,
      )
      .bind(
        id,
        input.businessId,
        input.productId,
        batchId,
        source,
        destination,
        productionBatchId,
        type,
        input.quantity,
        input.notes ?? "",
        input.userId,
      );
  }

  async createMovement(input: CreateMovementInput) {
    const product = await this.product(input);
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    if (input.movementType === "production")
      return this.produce(input, product.type);
    if (input.movementType === "disassembly")
      return this.disassemble(input, product.type);
    if (["purchase", "inventoryInjection"].includes(input.movementType))
      return this.createBatch(input);
    const batch = await this.batch(input);
    if (!batch) throw new Error("BATCH_REQUIRED");
    const inbound = ["customerReturn", "positiveAdjustment"].includes(
      input.movementType,
    );
    const transfer = input.movementType === "transfer";
    if (
      (transfer || !inbound) &&
      !(await this.location(input.businessId, input.sourceLocationId))
    )
      throw new Error("SOURCE_LOCATION_REQUIRED");
    if (
      (transfer || inbound) &&
      !(await this.location(input.businessId, input.destinationLocationId))
    )
      throw new Error("DESTINATION_LOCATION_REQUIRED");
    if (transfer && input.sourceLocationId === input.destinationLocationId)
      throw new Error("SAME_LOCATION");
    if (
      !inbound &&
      (await this.stock(input.businessId, batch.id, input.sourceLocationId!)) <
        input.quantity
    )
      throw new Error("NEGATIVE_STOCK");
    const id = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [];
    if (!inbound)
      statements.push(
        this.subtractStock(
          input.businessId,
          batch.id,
          input.sourceLocationId!,
          input.quantity,
        ),
      );
    if (inbound || transfer)
      statements.push(
        this.addStock(
          input.businessId,
          batch.id,
          input.destinationLocationId!,
          input.quantity,
        ),
      );
    statements.push(
      this.movement(input, id, batch.id),
      this.audit(input, id, { batchId: batch.id }),
    );
    await this.db.batch(statements);
    return { id, batchId: batch.id };
  }

  private async createBatch(input: CreateMovementInput) {
    if (!(await this.location(input.businessId, input.destinationLocationId)))
      throw new Error("DESTINATION_LOCATION_REQUIRED");
    if (
      input.unitCostCents == null ||
      input.cashPriceCents == null ||
      input.cardPriceCents == null
    )
      throw new Error("BATCH_PRICES_REQUIRED");
    if (
      input.supplierInvoiceId &&
      !(await this.db
        .prepare(
          `SELECT id FROM supplier_invoices WHERE id=? AND business_id=? AND deleted_at IS NULL`,
        )
        .bind(input.supplierInvoiceId, input.businessId)
        .first())
    )
      throw new Error("INVOICE_NOT_FOUND");
    const batchId = crypto.randomUUID(),
      id = crypto.randomUUID();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO inventory_batches (id,business_id,product_id,supplier_invoice_id,initial_quantity,unit_cost_cents,cash_price_cents,card_price_cents,received_at,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          batchId,
          input.businessId,
          input.productId,
          input.supplierInvoiceId ?? null,
          input.quantity,
          input.unitCostCents,
          input.cashPriceCents,
          input.cardPriceCents,
          input.receivedAt ?? new Date().toISOString(),
          input.userId,
        ),
      this.addStock(
        input.businessId,
        batchId,
        input.destinationLocationId!,
        input.quantity,
      ),
      this.movement(input, id, batchId),
      this.audit(input, id, { batchId }),
    ]);
    return { id, batchId };
  }

  private async produce(input: CreateMovementInput, productType: string) {
    if (productType !== "composite") throw new Error("COMPOSITE_REQUIRED");
    if (!Number.isInteger(input.quantity))
      throw new Error("INTEGER_QUANTITY_REQUIRED");
    if (
      !(await this.location(input.businessId, input.sourceLocationId)) ||
      !(await this.location(input.businessId, input.destinationLocationId))
    )
      throw new Error("PRODUCTION_LOCATIONS_REQUIRED");
    if (
      input.unitCostCents == null ||
      input.cashPriceCents == null ||
      input.cardPriceCents == null
    )
      throw new Error("BATCH_PRICES_REQUIRED");
    const components = await this.db
      .prepare(
        `SELECT component_product_id AS productId,quantity FROM product_components WHERE business_id=? AND parent_product_id=? AND deleted_at IS NULL`,
      )
      .bind(input.businessId, input.productId)
      .all<{ productId: string; quantity: number }>();
    if (!components.results.length) throw new Error("COMPOSITION_REQUIRED");
    const outputBatchId = crypto.randomUUID(),
      id = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO inventory_batches (id,business_id,product_id,initial_quantity,unit_cost_cents,cash_price_cents,card_price_cents,received_at,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          outputBatchId,
          input.businessId,
          input.productId,
          input.quantity,
          input.unitCostCents,
          input.cashPriceCents,
          input.cardPriceCents,
          input.receivedAt ?? new Date().toISOString(),
          input.userId,
        ),
      this.addStock(
        input.businessId,
        outputBatchId,
        input.destinationLocationId!,
        input.quantity,
      ),
    ];
    for (const component of components.results) {
      let remaining = Number(component.quantity) * input.quantity;
      const available = await this.db
        .prepare(
          `SELECT b.id,s.quantity FROM inventory_batch_stocks s JOIN inventory_batches b ON b.id=s.batch_id WHERE s.business_id=? AND s.location_id=? AND b.product_id=? AND b.deleted_at IS NULL AND s.quantity>0 ORDER BY b.received_at,b.id`,
        )
        .bind(input.businessId, input.sourceLocationId, component.productId)
        .all<{ id: string; quantity: number }>();
      for (const row of available.results) {
        if (remaining <= 0) break;
        const quantity = Math.min(remaining, Number(row.quantity));
        statements.push(
          this.subtractStock(
            input.businessId,
            row.id,
            input.sourceLocationId!,
            quantity,
          ),
          this.db
            .prepare(
              `INSERT INTO inventory_movements (id,business_id,product_id,batch_id,source_location_id,production_batch_id,movement_type,quantity,notes,created_by_user_id) VALUES (?,?,?,?,?,?,'transformation',?,?,?)`,
            )
            .bind(
              crypto.randomUUID(),
              input.businessId,
              component.productId,
              row.id,
              input.sourceLocationId,
              outputBatchId,
              quantity,
              input.notes ?? "Producción",
              input.userId,
            ),
        );
        remaining -= quantity;
      }
      if (remaining > 0) throw new Error("INSUFFICIENT_COMPONENT_STOCK");
    }
    statements.push(
      this.movement(input, id, outputBatchId),
      this.audit(input, id, { outputBatchId }),
    );
    await this.db.batch(statements);
    return { id, batchId: outputBatchId };
  }

  private async disassemble(input: CreateMovementInput, productType: string) {
    if (productType !== "composite" || !input.batchId)
      throw new Error("COMPOSITE_REQUIRED");
    if (!Number.isInteger(input.quantity))
      throw new Error("INTEGER_QUANTITY_REQUIRED");
    if (
      !(await this.location(input.businessId, input.sourceLocationId)) ||
      !(await this.location(input.businessId, input.destinationLocationId))
    )
      throw new Error("PRODUCTION_LOCATIONS_REQUIRED");
    if (
      (await this.stock(
        input.businessId,
        input.batchId,
        input.sourceLocationId!,
      )) < input.quantity
    )
      throw new Error("NEGATIVE_STOCK");
    const production = await this.db
      .prepare(
        `SELECT quantity FROM inventory_movements WHERE business_id=? AND batch_id=? AND movement_type='production' LIMIT 1`,
      )
      .bind(input.businessId, input.batchId)
      .first<{ quantity: number }>();
    if (!production) throw new Error("PRODUCTION_NOT_FOUND");
    const consumed = await this.db
      .prepare(
        `SELECT product_id AS productId,batch_id AS batchId,quantity FROM inventory_movements WHERE business_id=? AND production_batch_id=? AND movement_type='transformation'`,
      )
      .bind(input.businessId, input.batchId)
      .all<{ productId: string; batchId: string; quantity: number }>();
    const id = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      this.subtractStock(
        input.businessId,
        input.batchId,
        input.sourceLocationId!,
        input.quantity,
      ),
      this.movement(input, id, input.batchId),
    ];
    for (const row of consumed.results) {
      const quantity =
        (Number(row.quantity) * input.quantity) / Number(production.quantity);
      statements.push(
        this.addStock(
          input.businessId,
          row.batchId,
          input.destinationLocationId!,
          quantity,
        ),
        this.db
          .prepare(
            `INSERT INTO inventory_movements (id,business_id,product_id,batch_id,destination_location_id,production_batch_id,movement_type,quantity,notes,created_by_user_id) VALUES (?,?,?,?,?,?,'disassemblyReturn',?,?,?)`,
          )
          .bind(
            crypto.randomUUID(),
            input.businessId,
            row.productId,
            row.batchId,
            input.destinationLocationId,
            input.batchId,
            quantity,
            input.notes ?? "Desarme",
            input.userId,
          ),
      );
    }
    statements.push(this.audit(input, id, { batchId: input.batchId }));
    await this.db.batch(statements);
    return { id, batchId: input.batchId };
  }

  private audit(input: CreateMovementInput, id: string, metadata: object) {
    return this.db
      .prepare(
        `INSERT INTO audit_logs (id,business_id,entity_type,entity_id,action,description,metadata,created_by_user_id) VALUES (?,?,'inventoryMovement',?,'create','Movimiento de inventario',?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.businessId,
        id,
        JSON.stringify({
          ...metadata,
          movementType: input.movementType,
          sourceLocationId: input.sourceLocationId,
          destinationLocationId: input.destinationLocationId,
          quantity: input.quantity,
        }),
        input.userId,
      );
  }
}
