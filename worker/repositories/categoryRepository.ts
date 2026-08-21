export type CategoryRow = {
  id: string;
  name: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
};

export class CategoryRepository {
  constructor(private readonly db: D1Database) {}

  async list(businessId: string): Promise<CategoryRow[]> {
    const result = await this.db
      .prepare(
        `SELECT id, name, COALESCE(icon,'🛒') AS icon, created_at AS createdAt,
      updated_at AS updatedAt FROM categories
      WHERE business_id = ? AND deleted_at IS NULL ORDER BY name`,
      )
      .bind(businessId)
      .all<CategoryRow>();
    return result.results;
  }

  async create(
    businessId: string,
    name: string,
    icon: string,
  ): Promise<CategoryRow> {
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        "INSERT INTO categories (id, business_id, name, icon) VALUES (?, ?, ?, ?)",
      )
      .bind(id, businessId, name, icon)
      .run();
    return {
      id,
      name,
      icon,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async update(businessId: string, id: string, name: string, icon: string) {
    const result = await this.db
      .prepare(
        `UPDATE categories SET name=?,icon=?,updated_at=datetime('now')
         WHERE id=? AND business_id=? AND deleted_at IS NULL`,
      )
      .bind(name, icon, id, businessId)
      .run();
    return Number(result.meta.changes) > 0;
  }
}
