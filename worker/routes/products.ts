import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Bindings, Variables } from "../types";

export const productRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const productInput = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().max(50).optional().default(""),
  description: z.string().trim().max(500).optional().default(""),
  categoryId: z.string().uuid().nullable().optional().default(null),
  imageId: z.string().uuid().nullable().optional().default(null),
  salePriceCents: z.number().int().min(0),
  lowStockThreshold: z.number().min(0).default(0),
  initialStock: z.number().min(0).default(0),
});

productRoutes.get("/", async (c) => {
  const { businessId } = c.get("sessionUser");
  const result = await c.env.DB.prepare(`SELECT id, sku, name, description, category_id AS categoryId,
      image_id AS imageId,
      sale_price_cents AS salePriceCents, current_stock AS currentStock,
      low_stock_threshold AS lowStockThreshold, is_active AS isActive
    FROM products WHERE business_id = ? AND deleted_at IS NULL ORDER BY name`)
    .bind(businessId).all();
  return c.json({ products: result.results });
});

productRoutes.post("/", zValidator("json", productInput), async (c) => {
  const user = c.get("sessionUser");
  const input = c.req.valid("json");
  const id = crypto.randomUUID();
  const statements = [
    c.env.DB.prepare(`INSERT INTO products
      (id, business_id, category_id, image_id, sku, name, description, sale_price_cents, current_stock, low_stock_threshold)
      VALUES (?, ?, ?, ?, NULLIF(?, ''), ?, ?, ?, ?, ?)`)
      .bind(id, user.businessId, input.categoryId, input.imageId, input.sku, input.name, input.description, input.salePriceCents, input.initialStock, input.lowStockThreshold),
  ];
  if (input.initialStock > 0) {
    statements.push(c.env.DB.prepare(`INSERT INTO inventory_movements
      (id, business_id, product_id, user_id, type, quantity_delta, stock_before, stock_after, reason)
      VALUES (?, ?, ?, ?, 'initial', ?, 0, ?, 'Existencia inicial')`)
      .bind(crypto.randomUUID(), user.businessId, id, user.id, input.initialStock, input.initialStock));
  }
  await c.env.DB.batch(statements);
  return c.json({ id }, 201);
});

productRoutes.post(
  "/:id/stock-adjustments",
  zValidator("json", z.object({ quantityDelta: z.number().refine((value) => value !== 0), reason: z.string().trim().min(3).max(240) })),
  async (c) => {
    const user = c.get("sessionUser");
    const input = c.req.valid("json");
    const product = await c.env.DB.prepare("SELECT current_stock FROM products WHERE id = ? AND business_id = ? AND deleted_at IS NULL")
      .bind(c.req.param("id"), user.businessId).first<{ current_stock: number }>();
    if (!product) return c.json({ error: "Producto no encontrado" }, 404);
    const before = Number(product.current_stock);
    const after = before + input.quantityDelta;
    if (after < 0) return c.json({ error: "El ajuste dejaría el inventario negativo" }, 409);
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE products SET current_stock = ?, updated_at = datetime('now') WHERE id = ? AND business_id = ?")
        .bind(after, c.req.param("id"), user.businessId),
      c.env.DB.prepare(`INSERT INTO inventory_movements
        (id, business_id, product_id, user_id, type, quantity_delta, stock_before, stock_after, reason)
        VALUES (?, ?, ?, ?, 'adjustment', ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), user.businessId, c.req.param("id"), user.id, input.quantityDelta, before, after, input.reason),
    ]);
    return c.json({ currentStock: after });
  },
);

productRoutes.get("/:id/movements", async (c) => {
  const { businessId } = c.get("sessionUser");
  const result = await c.env.DB.prepare(`SELECT id, type, quantity_delta AS quantityDelta,
      stock_before AS stockBefore, stock_after AS stockAfter, reason, created_at AS createdAt
    FROM inventory_movements WHERE business_id = ? AND product_id = ? ORDER BY created_at DESC LIMIT 100`)
    .bind(businessId, c.req.param("id")).all();
  return c.json({ movements: result.results });
});
