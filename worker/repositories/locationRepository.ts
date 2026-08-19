export type LocationInput = {
  code: string;
  name: string;
  type: "warehouse" | "point_of_sale";
  address?: string;
};

export class LocationRepository {
  constructor(private readonly db: D1Database) {}
  async list(businessId: string, search = "") {
    const term = `%${search.trim()}%`;
    const result = await this.db
      .prepare(
        `SELECT l.id,l.code,l.name,l.type,l.address,l.is_active AS isActive,
        COALESCE(SUM(s.quantity),0) AS totalUnits,l.created_at AS createdAt,l.updated_at AS updatedAt
      FROM locations l LEFT JOIN inventory_batch_stocks s ON s.location_id=l.id AND s.business_id=l.business_id
      WHERE l.business_id=? AND l.deleted_at IS NULL AND (?='%%' OR l.name LIKE ? COLLATE NOCASE OR l.code LIKE ? COLLATE NOCASE)
      GROUP BY l.id ORDER BY l.type,l.name`,
      )
      .bind(businessId, term, term, term)
      .all();
    return result.results;
  }
  async create(businessId: string, input: LocationInput) {
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO locations (id,business_id,code,name,type,address) VALUES (?,?,?,?,?,NULLIF(?,''))`,
      )
      .bind(
        id,
        businessId,
        input.code,
        input.name,
        input.type,
        input.address ?? "",
      )
      .run();
    return id;
  }
  async update(businessId: string, id: string, input: LocationInput) {
    const result = await this.db
      .prepare(
        `UPDATE locations SET code=?,name=?,type=?,address=NULLIF(?,''),updated_at=datetime('now')
      WHERE id=? AND business_id=? AND deleted_at IS NULL`,
      )
      .bind(
        input.code,
        input.name,
        input.type,
        input.address ?? "",
        id,
        businessId,
      )
      .run();
    return Number(result.meta.changes) > 0;
  }
  async setActive(businessId: string, id: string, isActive: boolean) {
    if (!isActive) {
      const stock = await this.db
        .prepare(
          `SELECT COALESCE(SUM(quantity),0) AS quantity FROM inventory_batch_stocks WHERE business_id=? AND location_id=?`,
        )
        .bind(businessId, id)
        .first<{ quantity: number }>();
      if (Number(stock?.quantity ?? 0) > 0)
        throw new Error("LOCATION_HAS_STOCK");
    }
    const result = await this.db
      .prepare(
        `UPDATE locations SET is_active=?,updated_at=datetime('now') WHERE id=? AND business_id=? AND deleted_at IS NULL`,
      )
      .bind(isActive ? 1 : 0, id, businessId)
      .run();
    return Number(result.meta.changes) > 0;
  }
}
