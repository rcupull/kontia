export type CategoryRow = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export class CategoryRepository {
  constructor(private readonly db: D1Database) {}

  async list(businessId: string): Promise<CategoryRow[]> {
    const result = await this.db
      .prepare(
        `SELECT id, name, created_at AS createdAt,
      updated_at AS updatedAt FROM categories
      WHERE business_id = ? AND deleted_at IS NULL ORDER BY name`,
      )
      .bind(businessId)
      .all<CategoryRow>();
    return result.results;
  }

  async create(businessId: string, name: string): Promise<CategoryRow> {
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        "INSERT INTO categories (id, business_id, name) VALUES (?, ?, ?)",
      )
      .bind(id, businessId, name)
      .run();
    return {
      id,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
