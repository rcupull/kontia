import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { SupplierRepository } from "../repositories/supplierRepository";
import type { Bindings, Variables } from "../types";

export const supplierRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();
const input = z.object({
  name: z.string().trim().min(2).max(120),
  taxId: z.string().trim().max(60).optional(),
  contactName: z.string().trim().max(120).optional(),
  email: z.string().trim().email().or(z.literal("")).optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(240).optional(),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

supplierRoutes.get("/", async (c) =>
  c.json({
    suppliers: await new SupplierRepository(c.env.DB).list(
      c.get("sessionUser").businessId,
      c.req.query("search"),
    ),
  }),
);
supplierRoutes.post("/", zValidator("json", input), async (c) =>
  c.json(
    {
      id: await new SupplierRepository(c.env.DB).create(
        c.get("sessionUser").businessId,
        c.req.valid("json"),
      ),
    },
    201,
  ),
);
supplierRoutes.put("/:id", zValidator("json", input), async (c) => {
  const updated = await new SupplierRepository(c.env.DB).update(
    c.get("sessionUser").businessId,
    c.req.param("id"),
    c.req.valid("json"),
  );
  return updated
    ? c.json({ ok: true })
    : c.json({ error: "Proveedor no encontrado" }, 404);
});
