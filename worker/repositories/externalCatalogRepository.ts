export type ExternalAvailabilityRow = {
  productId: string;
  productName: string;
  sku: string | null;
  batchId: string;
  receivedAt: string;
  locationId: string;
  locationName: string;
  locationType: "warehouse" | "point_of_sale";
  quantity: number;
};

export class ExternalCatalogRepository {
  constructor(private readonly db: D1Database) {}

  async listProducts(search = "") {
    const pattern = `%${search.trim()}%`;
    const result = await this.db
      .prepare(
        `SELECT p.id,p.business_id AS businessId,business.name AS businessName,
          upper(business.currency) AS currencyCode,
          p.sku,p.name,p.description,p.type,
          COALESCE(SUM(CASE WHEN b.deleted_at IS NULL AND l.is_active=1 AND l.deleted_at IS NULL THEN bs.quantity ELSE 0 END),0) AS availableQuantity,
          MAX(CASE WHEN b.deleted_at IS NULL AND l.is_active=1 AND l.deleted_at IS NULL
            AND bs.quantity>0 THEN b.unit_cost_cents ELSE NULL END) AS maximumAvailableUnitCostCents
         FROM products p
         JOIN businesses business ON business.id=p.business_id AND business.is_active=1
         LEFT JOIN inventory_batches b ON b.product_id=p.id AND b.business_id=p.business_id
         LEFT JOIN inventory_batch_stocks bs ON bs.batch_id=b.id AND bs.business_id=p.business_id
         LEFT JOIN locations l ON l.id=bs.location_id AND l.business_id=p.business_id
         WHERE p.deleted_at IS NULL AND p.is_active=1
           AND (?='%%' OR p.name LIKE ? COLLATE NOCASE OR p.sku LIKE ? COLLATE NOCASE)
         GROUP BY p.id
         ORDER BY p.name COLLATE NOCASE
         LIMIT 200`,
      )
      .bind(pattern, pattern, pattern)
      .all();
    return result.results;
  }

  async availability(productId: string) {
    const product = await this.db
      .prepare(
        `SELECT p.id,p.business_id AS businessId,p.sku,p.name FROM products p
         JOIN businesses business ON business.id=p.business_id AND business.is_active=1
         WHERE p.id=? AND p.deleted_at IS NULL AND p.is_active=1`,
      )
      .bind(productId)
      .first<{
        id: string;
        businessId: string;
        sku: string | null;
        name: string;
      }>();
    if (!product) return null;

    const result = await this.db
      .prepare(
        `SELECT p.id AS productId,p.name AS productName,p.sku,
          b.id AS batchId,b.received_at AS receivedAt,
          l.id AS locationId,l.name AS locationName,l.type AS locationType,bs.quantity
         FROM products p
         JOIN inventory_batches b ON b.product_id=p.id AND b.business_id=p.business_id
         JOIN inventory_batch_stocks bs ON bs.batch_id=b.id AND bs.business_id=p.business_id
         JOIN locations l ON l.id=bs.location_id AND l.business_id=p.business_id
         WHERE p.id=? AND p.business_id=? AND p.deleted_at IS NULL AND p.is_active=1
           AND b.deleted_at IS NULL AND l.deleted_at IS NULL AND l.is_active=1 AND bs.quantity>0
         ORDER BY l.name COLLATE NOCASE,b.received_at ASC,b.id ASC`,
      )
      .bind(productId, product.businessId)
      .all<ExternalAvailabilityRow>();

    const locations = new Map<
      string,
      {
        locationId: string;
        locationName: string;
        locationType: "warehouse" | "point_of_sale";
        availableQuantity: number;
        batches: Array<{
          batchId: string;
          receivedAt: string;
          quantity: number;
        }>;
      }
    >();
    for (const row of result.results) {
      const location = locations.get(row.locationId) ?? {
        locationId: row.locationId,
        locationName: row.locationName,
        locationType: row.locationType,
        availableQuantity: 0,
        batches: [],
      };
      const quantity = Number(row.quantity);
      location.availableQuantity += quantity;
      location.batches.push({
        batchId: row.batchId,
        receivedAt: row.receivedAt,
        quantity,
      });
      locations.set(row.locationId, location);
    }
    const locationList = [...locations.values()];
    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      totalAvailable: locationList.reduce(
        (total, location) => total + location.availableQuantity,
        0,
      ),
      locations: locationList,
    };
  }

  private findExternalOperation(operationKey: string) {
    return this.db
      .prepare(
        `SELECT id,product_id AS productId,location_id AS locationId,quantity,
          external_reference AS externalReference,source_system AS sourceSystem,
          created_at AS createdAt,reversed_at AS reversedAt,reversal_reference AS reversalReference
         FROM external_inventory_operations WHERE operation_key=?`,
      )
      .bind(operationKey)
      .first();
  }

  async createExternalSale(input: {
    productId: string;
    locationId: string;
    quantity: number;
    operationKey: string;
    externalReference: string;
    sourceSystem: string;
  }) {
    const existing = await this.findExternalOperation(input.operationKey);
    if (existing) return { operation: existing, alreadyProcessed: true };

    const product = await this.db
      .prepare(
        `SELECT p.id,p.business_id AS businessId,p.name
         FROM products p JOIN businesses b ON b.id=p.business_id AND b.is_active=1
         WHERE p.id=? AND p.deleted_at IS NULL AND p.is_active=1`,
      )
      .bind(input.productId)
      .first<{ id: string; businessId: string; name: string }>();
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    const location = await this.db
      .prepare(
        `SELECT id,name FROM locations
         WHERE id=? AND business_id=? AND is_active=1 AND deleted_at IS NULL`,
      )
      .bind(input.locationId, product.businessId)
      .first<{ id: string; name: string }>();
    if (!location) throw new Error("LOCATION_NOT_FOUND");
    const batches = await this.db
      .prepare(
        `SELECT b.id,bs.quantity FROM inventory_batches b
         JOIN inventory_batch_stocks bs ON bs.batch_id=b.id AND bs.business_id=b.business_id
         WHERE b.product_id=? AND b.business_id=? AND b.deleted_at IS NULL
           AND bs.location_id=? AND bs.quantity>0
         ORDER BY b.received_at ASC,b.id ASC`,
      )
      .bind(product.id, product.businessId, location.id)
      .all<{ id: string; quantity: number }>();
    const total = batches.results.reduce(
      (sum, batch) => sum + Number(batch.quantity),
      0,
    );
    if (total < input.quantity) throw new Error("INSUFFICIENT_STOCK");

    const operationId = crypto.randomUUID();
    const note = `Venta externa · ${input.externalReference} · Origen: ${input.sourceSystem} · Ubicación: ${location.name}`;
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO external_inventory_operations
           (id,business_id,product_id,location_id,operation_key,quantity,external_reference,source_system)
           VALUES (?,?,?,?,?,?,?,?)`,
        )
        .bind(
          operationId,
          product.businessId,
          product.id,
          location.id,
          input.operationKey,
          input.quantity,
          input.externalReference,
          input.sourceSystem,
        ),
    ];
    let remaining = input.quantity;
    for (const batch of batches.results) {
      if (remaining <= 0) break;
      const quantity = Math.min(remaining, Number(batch.quantity));
      statements.push(
        this.db
          .prepare(
            `UPDATE inventory_batch_stocks SET quantity=quantity-?,updated_at=datetime('now')
             WHERE business_id=? AND batch_id=? AND location_id=?`,
          )
          .bind(quantity, product.businessId, batch.id, location.id),
        this.db
          .prepare(
            `INSERT INTO inventory_movements
             (id,business_id,product_id,batch_id,source_location_id,movement_type,quantity,notes)
             VALUES (?,?,?,?,?,'externalSale',?,?)`,
          )
          .bind(
            crypto.randomUUID(),
            product.businessId,
            product.id,
            batch.id,
            location.id,
            quantity,
            note,
          ),
        this.db
          .prepare(
            `INSERT INTO external_inventory_operation_items (operation_id,batch_id,quantity)
             VALUES (?,?,?)`,
          )
          .bind(operationId, batch.id, quantity),
      );
      remaining -= quantity;
    }
    try {
      await this.db.batch(statements);
    } catch (error) {
      const concurrent = await this.findExternalOperation(input.operationKey);
      if (concurrent) return { operation: concurrent, alreadyProcessed: true };
      if (error instanceof Error && error.message.includes("constraint")) {
        throw new Error("INSUFFICIENT_STOCK");
      }
      throw error;
    }
    return {
      operation: {
        id: operationId,
        productId: product.id,
        locationId: location.id,
        locationName: location.name,
        quantity: input.quantity,
        externalReference: input.externalReference,
        sourceSystem: input.sourceSystem,
      },
      alreadyProcessed: false,
    };
  }

  async reverseExternalSale(input: {
    operationKey: string;
    reversalReference: string;
    sourceSystem: string;
  }) {
    const operation = await this.db
      .prepare(
        `SELECT o.id,o.business_id AS businessId,o.product_id AS productId,
          o.location_id AS locationId,o.quantity,o.external_reference AS externalReference,
          o.reversed_at AS reversedAt,l.name AS locationName
         FROM external_inventory_operations o
         JOIN locations l ON l.id=o.location_id
         WHERE o.operation_key=?`,
      )
      .bind(input.operationKey)
      .first<{
        id: string;
        businessId: string;
        productId: string;
        locationId: string;
        locationName: string;
        quantity: number;
        externalReference: string;
        reversedAt: string | null;
      }>();
    if (!operation) throw new Error("EXTERNAL_OPERATION_NOT_FOUND");
    if (operation.reversedAt) return { operation, alreadyReversed: true };
    const items = await this.db
      .prepare(
        `SELECT batch_id AS batchId,quantity
         FROM external_inventory_operation_items WHERE operation_id=?`,
      )
      .bind(operation.id)
      .all<{ batchId: string; quantity: number }>();
    if (!items.results.length)
      throw new Error("EXTERNAL_OPERATION_ITEMS_NOT_FOUND");
    const note = `Reversión de venta externa · ${input.reversalReference} · Salida original: ${operation.externalReference} · Origen: ${input.sourceSystem} · Ubicación: ${operation.locationName}`;
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO external_inventory_reversals
           (operation_id,reversal_reference,source_system) VALUES (?,?,?)`,
        )
        .bind(operation.id, input.reversalReference, input.sourceSystem),
    ];
    for (const item of items.results) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO inventory_batch_stocks (business_id,batch_id,location_id,quantity)
             VALUES (?,?,?,?)
             ON CONFLICT(batch_id,location_id) DO UPDATE SET
               quantity=quantity+excluded.quantity,updated_at=datetime('now')`,
          )
          .bind(
            operation.businessId,
            item.batchId,
            operation.locationId,
            item.quantity,
          ),
        this.db
          .prepare(
            `INSERT INTO inventory_movements
             (id,business_id,product_id,batch_id,destination_location_id,movement_type,quantity,notes)
             VALUES (?,?,?,?,?,'customerReturn',?,?)`,
          )
          .bind(
            crypto.randomUUID(),
            operation.businessId,
            operation.productId,
            item.batchId,
            operation.locationId,
            item.quantity,
            note,
          ),
      );
    }
    statements.push(
      this.db
        .prepare(
          `UPDATE external_inventory_operations
           SET reversed_at=datetime('now'),reversal_reference=?
           WHERE id=? AND reversed_at IS NULL`,
        )
        .bind(input.reversalReference, operation.id),
    );
    try {
      await this.db.batch(statements);
    } catch (error) {
      const reversed = await this.findExternalOperation(input.operationKey);
      if (reversed?.reversedAt)
        return { operation: reversed, alreadyReversed: true };
      throw error;
    }
    return {
      operation: { ...operation, reversedAt: new Date().toISOString() },
      alreadyReversed: false,
    };
  }
}
