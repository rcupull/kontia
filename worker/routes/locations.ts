import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { LocationRepository } from "../repositories/locationRepository";
import type { Bindings, Variables } from "../types";

export const locationRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();
const input = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(2).max(120),
  type: z.enum(["warehouse", "point_of_sale"]),
  address: z.string().trim().max(240).optional(),
});
locationRoutes.get("/", async (c) =>
  c.json({
    locations: await new LocationRepository(c.env.DB).list(
      c.get("sessionUser").businessId,
      c.req.query("search"),
    ),
  }),
);
locationRoutes.post("/", zValidator("json", input), async (c) =>
  c.json(
    {
      id: await new LocationRepository(c.env.DB).create(
        c.get("sessionUser").businessId,
        c.req.valid("json"),
      ),
    },
    201,
  ),
);
locationRoutes.put("/:id", zValidator("json", input), async (c) =>
  (await new LocationRepository(c.env.DB).update(
    c.get("sessionUser").businessId,
    c.req.param("id"),
    c.req.valid("json"),
  ))
    ? c.json({ ok: true })
    : c.json({ error: "Ubicación no encontrada" }, 404),
);
locationRoutes.patch(
  "/:id/status",
  zValidator("json", z.object({ isActive: z.boolean() })),
  async (c) => {
    try {
      return (await new LocationRepository(c.env.DB).setActive(
        c.get("sessionUser").businessId,
        c.req.param("id"),
        c.req.valid("json").isActive,
      ))
        ? c.json({ ok: true })
        : c.json({ error: "Ubicación no encontrada" }, 404);
    } catch (error) {
      if (error instanceof Error && error.message === "LOCATION_HAS_STOCK")
        return c.json(
          {
            error:
              "No puedes desactivar una ubicación que todavía tiene existencias",
          },
          409,
        );
      throw error;
    }
  },
);
