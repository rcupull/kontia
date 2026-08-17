export type SupplierInput = {
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

export class SupplierRepository {
  constructor(private readonly db: D1Database) {}

  async list(businessId: string, search = "") {
    const term = `%${search.trim()}%`;
    const result = await this.db.prepare(`SELECT id, name, tax_id AS taxId,
        contact_name AS contactName, email, phone, address, city, country, notes,
        created_at AS createdAt, updated_at AS updatedAt
      FROM suppliers WHERE business_id = ? AND deleted_at IS NULL
        AND (? = '%%' OR name LIKE ? COLLATE NOCASE OR tax_id LIKE ? COLLATE NOCASE)
      ORDER BY name`).bind(businessId, term, term, term).all();
    return result.results;
  }

  async create(businessId: string, input: SupplierInput) {
    const id = crypto.randomUUID();
    await this.db.prepare(`INSERT INTO suppliers
      (id, business_id, name, tax_id, contact_name, email, phone, address, city, country, notes)
      VALUES (?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''),
        NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''))`)
      .bind(id, businessId, input.name, input.taxId ?? "", input.contactName ?? "",
        input.email ?? "", input.phone ?? "", input.address ?? "", input.city ?? "",
        input.country ?? "", input.notes ?? "").run();
    return id;
  }

  async update(businessId: string, id: string, input: SupplierInput) {
    const result = await this.db.prepare(`UPDATE suppliers SET name = ?, tax_id = NULLIF(?, ''),
        contact_name = NULLIF(?, ''), email = NULLIF(?, ''), phone = NULLIF(?, ''),
        address = NULLIF(?, ''), city = NULLIF(?, ''), country = NULLIF(?, ''),
        notes = NULLIF(?, ''), updated_at = datetime('now')
      WHERE id = ? AND business_id = ? AND deleted_at IS NULL`)
      .bind(input.name, input.taxId ?? "", input.contactName ?? "", input.email ?? "",
        input.phone ?? "", input.address ?? "", input.city ?? "", input.country ?? "",
        input.notes ?? "", id, businessId).run();
    return Number(result.meta.changes) > 0;
  }
}
