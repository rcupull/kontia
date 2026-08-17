import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { CatalogRepository } from "../repositories/catalogRepository";
import type { Bindings, Variables } from "../types";

export const productRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const productInput = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().max(50).optional().default(""),
  description: z.string().trim().max(500).optional().default(""),
  categoryId: z.string().uuid().nullable().optional().default(null),
  imageId: z.string().uuid().nullable().optional().default(null),
  type: z.enum(["basic", "composite"]).default("basic"),
  unitCostCents: z.number().int().min(0).default(0),
  cashPriceCents: z.number().int().min(0),
  cardPriceCents: z.number().int().min(0),
  initialStock: z.number().min(0).default(0),
  lowStockThreshold: z.number().min(0).default(0),
});

productRoutes.get("/", async (c) => {
  const products = await new CatalogRepository(c.env.DB).listProducts(c.get("sessionUser").businessId);
  return c.json({ products });
});

productRoutes.post("/", zValidator("json", productInput), async (c) => {
  const user = c.get("sessionUser");
  const result = await new CatalogRepository(c.env.DB).createProduct({
    ...c.req.valid("json"), businessId: user.businessId, userId: user.id,
  });
  return c.json(result, 201);
});

productRoutes.post("/:id/stock-adjustments", zValidator("json", z.object({
  quantityDelta: z.number().refine((value) => value !== 0),
  reason: z.string().trim().min(3).max(240),
})), async (c) => {
  const user = c.get("sessionUser");
  try {
    const adjusted = await new CatalogRepository(c.env.DB).adjustWarehouseStock({
      businessId: user.businessId, productId: c.req.param("id"), userId: user.id,
      ...c.req.valid("json"),
    });
    if (!adjusted) return c.json({ error: "Producto o lote no encontrado" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_WAREHOUSE_STOCK") {
      return c.json({ error: "No hay suficiente existencia en almacén" }, 409);
    }
    throw error;
  }
});

productRoutes.get("/:id/movements", async (c) => {
  const { businessId } = c.get("sessionUser");
  const movements = await new CatalogRepository(c.env.DB).listMovements(businessId, c.req.param("id"));
  return c.json({ movements });
});
