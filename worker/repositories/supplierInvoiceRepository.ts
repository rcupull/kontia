export type SupplierInvoiceInput = {
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmountCents: number;
  notes?: string;
};

export class SupplierInvoiceRepository {
  constructor(private readonly db: D1Database) {}

  async list(businessId: string, search = "") {
    const term = `%${search.trim()}%`;
    const result = await this.db
      .prepare(
        `SELECT i.id, i.supplier_id AS supplierId,
        s.name AS supplierName, i.invoice_number AS invoiceNumber,
        i.invoice_date AS invoiceDate, i.total_amount_cents AS totalAmountCents,
        i.notes, i.created_at AS createdAt,
        COUNT(DISTINCT b.id) AS batchCount,
        COALESCE(SUM(CASE
          WHEN m.movement_type='negativeAdjustment' THEN -(m.quantity*b.unit_cost_cents)
          WHEN m.id IS NOT NULL THEN m.quantity*b.unit_cost_cents ELSE 0 END),0) AS batchesTotalCents,
        COALESCE(MAX(CASE WHEN m.id IS NOT NULL AND b.unit_cost_cents<=0 THEN 1 ELSE 0 END),0) AS hasInvalidCosts
      FROM supplier_invoices i
      JOIN suppliers s ON s.id = i.supplier_id AND s.business_id = i.business_id
      LEFT JOIN inventory_batches b ON b.supplier_invoice_id = i.id AND b.deleted_at IS NULL
      LEFT JOIN inventory_movements m ON m.batch_id=b.id AND m.business_id=i.business_id
        AND m.deleted_at IS NULL AND m.movement_type IN ('purchase','positiveAdjustment','negativeAdjustment')
      WHERE i.business_id = ? AND i.deleted_at IS NULL
        AND (? = '%%' OR i.invoice_number LIKE ? COLLATE NOCASE OR s.name LIKE ? COLLATE NOCASE)
      GROUP BY i.id ORDER BY i.invoice_date DESC, i.created_at DESC`,
      )
      .bind(businessId, term, term, term)
      .all();
    return result.results;
  }

  async reconciliation(businessId: string, invoiceId: string) {
    const invoice = await this.db
      .prepare(
        `SELECT id FROM supplier_invoices WHERE id=? AND business_id=? AND deleted_at IS NULL`,
      )
      .bind(invoiceId, businessId)
      .first();
    if (!invoice) return null;
    const result = await this.db
      .prepare(
        `SELECT m.id,m.created_at AS createdAt,m.movement_type AS movementType,
          m.quantity,b.id AS batchId,b.received_at AS receivedAt,b.unit_cost_cents AS unitCostCents,
          p.id AS productId,p.name AS productName,
          CASE WHEN m.movement_type='negativeAdjustment'
            THEN -(m.quantity*b.unit_cost_cents) ELSE m.quantity*b.unit_cost_cents END AS totalCostCents
        FROM inventory_batches b
        JOIN inventory_movements m ON m.batch_id=b.id AND m.business_id=b.business_id
          AND m.deleted_at IS NULL AND m.movement_type IN ('purchase','positiveAdjustment','negativeAdjustment')
        JOIN products p ON p.id=b.product_id AND p.business_id=b.business_id
        WHERE b.business_id=? AND b.supplier_invoice_id=? AND b.deleted_at IS NULL
        ORDER BY m.created_at,m.id`,
      )
      .bind(businessId, invoiceId)
      .all();
    return result.results;
  }

  async create(businessId: string, input: SupplierInvoiceInput) {
    const supplier = await this.db
      .prepare(
        `SELECT id FROM suppliers
      WHERE id = ? AND business_id = ? AND deleted_at IS NULL`,
      )
      .bind(input.supplierId, businessId)
      .first();
    if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO supplier_invoices
      (id, business_id, supplier_id, invoice_number, invoice_date, total_amount_cents, notes)
      VALUES (?, ?, ?, ?, ?, ?, NULLIF(?, ''))`,
      )
      .bind(
        id,
        businessId,
        input.supplierId,
        input.invoiceNumber,
        input.invoiceDate,
        input.totalAmountCents,
        input.notes ?? "",
      )
      .run();
    return id;
  }

  async update(businessId: string, id: string, input: SupplierInvoiceInput) {
    const supplier = await this.db
      .prepare(
        `SELECT id FROM suppliers
      WHERE id = ? AND business_id = ? AND deleted_at IS NULL`,
      )
      .bind(input.supplierId, businessId)
      .first();
    if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
    const result = await this.db
      .prepare(
        `UPDATE supplier_invoices SET
        supplier_id = ?, invoice_number = ?, invoice_date = ?, total_amount_cents = ?,
        notes = NULLIF(?, ''), updated_at = datetime('now')
      WHERE id = ? AND business_id = ? AND deleted_at IS NULL`,
      )
      .bind(
        input.supplierId,
        input.invoiceNumber,
        input.invoiceDate,
        input.totalAmountCents,
        input.notes ?? "",
        id,
        businessId,
      )
      .run();
    return Number(result.meta.changes) > 0;
  }
}
