import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { PosRepository } from "../repositories/posRepository";
import type { Bindings, Variables } from "../types";
export const posRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();
posRoutes.get("/state", async (c) => {
  const u = c.get("sessionUser");
  return c.json(await new PosRepository(c.env.DB).state(u.businessId, u.id));
});
posRoutes.post(
  "/sessions",
  zValidator(
    "json",
    z.object({
      locationId: z.string().uuid(),
      openingAmountCents: z.number().int().nonnegative(),
    }),
  ),
  async (c) => {
    const u = c.get("sessionUser");
    try {
      const values = c.req.valid("json");
      return c.json(
        {
          session: await new PosRepository(c.env.DB).open(
            u.businessId,
            u.id,
            values.locationId,
            values.openingAmountCents,
          ),
        },
        201,
      );
    } catch (e) {
      const messages: Record<string, string> = {
        SESSION_ALREADY_OPEN: "Ya existe una caja abierta",
        POS_LOCATION_NOT_FOUND: "Selecciona un punto de venta activo",
      };
      if (e instanceof Error && messages[e.message])
        return c.json({ error: messages[e.message] }, 409);
      throw e;
    }
  },
);
posRoutes.post(
  "/sales",
  zValidator(
    "json",
    z.object({
      paymentMethod: z.enum(["cash", "card"]),
      cashSessionId: z.string().uuid(),
      operationId: z.string().uuid(),
      createdAt: z.string().datetime({ offset: true }),
      expectedTotalCents: z.number().int().nonnegative(),
      items: z
        .array(
          z.object({
            productId: z.string().uuid(),
            quantity: z.number().positive(),
          }),
        )
        .min(1)
        .max(100),
    }),
  ),
  async (c) => {
    const u = c.get("sessionUser");
    try {
      return c.json(
        await new PosRepository(c.env.DB).sale({
          ...c.req.valid("json"),
          businessId: u.businessId,
          userId: u.id,
        }),
        201,
      );
    } catch (e) {
      const messages: Record<string, string> = {
        SESSION_REQUIRED: "Abre la caja antes de vender",
        PRODUCT_NOT_FOUND: "Producto no encontrado",
        INSUFFICIENT_STOCK: "No hay existencia suficiente",
        PRICE_CHANGED: "Los precios cambiaron durante la desconexión",
        OFFLINE_PERIOD_EXPIRED: "La venta excede el período offline permitido",
      };
      if (e instanceof Error && messages[e.message])
        return c.json({ error: messages[e.message] }, 409);
      throw e;
    }
  },
);
posRoutes.get("/orders", async (c) => {
  const u = c.get("sessionUser");
  try {
    return c.json({
      orders: await new PosRepository(c.env.DB).orders(u.businessId, u.id),
    });
  } catch (e) {
    if (e instanceof Error && e.message === "SESSION_REQUIRED")
      return c.json({ error: "No hay una caja abierta" }, 409);
    throw e;
  }
});
posRoutes.post(
  "/orders/:id/refund",
  zValidator(
    "json",
    z.object({ notes: z.string().trim().max(500).optional() }),
  ),
  async (c) => {
    const u = c.get("sessionUser");
    try {
      return c.json(
        await new PosRepository(c.env.DB).refund(
          u.businessId,
          u.id,
          c.req.param("id"),
          c.req.valid("json").notes,
        ),
        201,
      );
    } catch (e) {
      const messages: Record<string, string> = {
        SESSION_REQUIRED: "No hay una caja abierta",
        SALE_NOT_FOUND: "La venta no pertenece a esta sesión",
        SALE_ALREADY_REFUNDED: "Esta venta ya fue reintegrada",
        SALE_ALLOCATIONS_NOT_FOUND: "No se encontraron los lotes de la venta",
      };
      if (e instanceof Error && messages[e.message])
        return c.json({ error: messages[e.message] }, 409);
      throw e;
    }
  },
);
posRoutes.post(
  "/sessions/close",
  zValidator(
    "json",
    z.object({ countedCashAmountCents: z.number().int().nonnegative() }),
  ),
  async (c) => {
    const u = c.get("sessionUser");
    try {
      return c.json(
        await new PosRepository(c.env.DB).close(
          u.businessId,
          u.id,
          c.req.valid("json").countedCashAmountCents,
        ),
      );
    } catch (e) {
      if (e instanceof Error && e.message === "SESSION_REQUIRED")
        return c.json({ error: "No hay una caja abierta" }, 409);
      throw e;
    }
  },
);
