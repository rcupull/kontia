import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { BusinessRepository } from "../repositories/businessRepository";
import type { Bindings, Variables } from "../types";

export const businessRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

const settings = z.object({
  name: z.string().trim().min(2).max(80),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, "La moneda debe ser un código ISO de 3 letras"),
  salesTaxPercentage: z.number().min(0).max(100),
});

businessRoutes.get("/current", async (c) => {
  const business = await new BusinessRepository(c.env.DB).get(
    c.get("sessionUser").businessId,
  );
  return business
    ? c.json({ business })
    : c.json({ error: "Negocio no encontrado" }, 404);
});

businessRoutes.put("/current", zValidator("json", settings), async (c) => {
  const user = c.get("sessionUser");
  if (user.role !== "owner")
    return c.json(
      { error: "Solo el propietario puede editar el negocio" },
      403,
    );
  const updated = await new BusinessRepository(c.env.DB).update(
    user.businessId,
    c.req.valid("json"),
  );
  return updated
    ? c.json({ ok: true })
    : c.json({ error: "Negocio no encontrado" }, 404);
});
