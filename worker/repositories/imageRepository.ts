export type ImageRow = {
  id: string;
  business_id: string;
  content_type: string;
  data: number[];
  size_bytes: number;
};

export class ImageRepository {
  constructor(private readonly db: D1Database) {}

  find(id: string): Promise<ImageRow | null> {
    return this.db.prepare(`SELECT id, business_id, content_type, data, size_bytes
      FROM images WHERE id = ?`).bind(id).first<ImageRow>();
  }

  async create(businessId: string, contentType: string, data: ArrayBuffer): Promise<string> {
    const id = crypto.randomUUID();
    await this.db.prepare(`INSERT INTO images
      (id, business_id, content_type, data, size_bytes) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, businessId, contentType, data, data.byteLength).run();
    return id;
  }
}
