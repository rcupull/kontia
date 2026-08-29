import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { ExternalCatalogRepository } from "../repositories/externalCatalogRepository";

export const externalRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

externalRoutes.use("*", async (c, next) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!c.env.EXTERNAL_API_TOKEN || token !== c.env.EXTERNAL_API_TOKEN) {
    return c.json({ error: "Credencial externa no autorizada" }, 401);
  }
  await next();
});

externalRoutes.get("/products", async (c) => {
  const products = await new ExternalCatalogRepository(c.env.DB).listProducts(
    c.req.query("search") ?? "",
  );
  c.header("Cache-Control", "private, no-store");
  return c.json({ products });
});

externalRoutes.get("/products/:id/availability", async (c) => {
  const availability = await new ExternalCatalogRepository(c.env.DB).availability(
    c.req.param("id"),
  );
  if (!availability) return c.json({ error: "Producto no encontrado" }, 404);
  c.header("Cache-Control", "private, no-store");
  return c.json(availability);
});

externalRoutes.post(
  "/products/:id/external-sales",
  zValidator(
    "json",
    z.object({
      locationId: z.string().uuid(),
      quantity: z.number().positive(),
      operationKey: z.string().trim().min(1).max(200),
      externalReference: z.string().trim().min(1).max(200),
      sourceSystem: z.string().trim().min(1).max(100),
    }),
  ),
  async (c) => {
    try {
      const result = await new ExternalCatalogRepository(c.env.DB).createExternalSale({
        productId: c.req.param("id"),
        ...c.req.valid("json"),
      });
      return c.json(result, result.alreadyProcessed ? 200 : 201);
    } catch (error) {
      if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
        return c.json({ error: "Producto no encontrado" }, 404);
      }
      if (error instanceof Error && error.message === "LOCATION_NOT_FOUND") {
        return c.json({ error: "Ubicación no encontrada" }, 404);
      }
      if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
        return c.json({ error: "No hay existencia suficiente en esa ubicación" }, 409);
      }
      throw error;
    }
  },
);

externalRoutes.post(
  "/external-operations/:operationKey/reverse",
  zValidator(
    "json",
    z.object({
      reversalReference: z.string().trim().min(1).max(200),
      sourceSystem: z.string().trim().min(1).max(100),
    }),
  ),
  async (c) => {
    try {
      return c.json(
        await new ExternalCatalogRepository(c.env.DB).reverseExternalSale({
          operationKey: c.req.param("operationKey"),
          ...c.req.valid("json"),
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "EXTERNAL_OPERATION_NOT_FOUND") {
        return c.json({ error: "Operación externa no encontrada" }, 404);
      }
      throw error;
    }
  },
);
