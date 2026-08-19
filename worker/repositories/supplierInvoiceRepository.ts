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
        COUNT(b.id) AS batchCount
      FROM supplier_invoices i
      JOIN suppliers s ON s.id = i.supplier_id AND s.business_id = i.business_id
      LEFT JOIN inventory_batches b ON b.supplier_invoice_id = i.id AND b.deleted_at IS NULL
      WHERE i.business_id = ? AND i.deleted_at IS NULL
        AND (? = '%%' OR i.invoice_number LIKE ? COLLATE NOCASE OR s.name LIKE ? COLLATE NOCASE)
      GROUP BY i.id ORDER BY i.invoice_date DESC, i.created_at DESC`,
      )
      .bind(businessId, term, term, term)
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
