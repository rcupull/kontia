import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { AdminRepository } from "../repositories/adminRepository";
import type { Bindings, Variables } from "../types";
import { monetaryComponentSchema, moneyError } from "./money";

export const adminRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();
const financial = z.object({
  type: z.enum([
    "capitalInjection",
    "sessionClose",
    "operatingExpense",
    "inventoryReinvestment",
    "ownerWithdrawal",
    "saleRefund",
    "positiveAdjustment",
    "negativeAdjustment",
  ]),
  expenseType: z.string().optional(),
  moneyLocation: z.enum(["cashDeposit", "bankAccount"]),
  amountCents: z.number().int().positive(),
  description: z.string().trim().min(1).max(200),
  movementDate: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(500).optional(),
  components: z.array(monetaryComponentSchema).max(12).optional(),
});
adminRoutes.get("/sales", async (c) =>
  c.json({
    sales: await new AdminRepository(c.env.DB).sales(
      c.get("sessionUser").businessId,
      c.req.query("search"),
    ),
  }),
);
adminRoutes.get("/sessions", async (c) =>
  c.json({
    sessions: await new AdminRepository(c.env.DB).sessions(
      c.get("sessionUser").businessId,
      c.req.query("search"),
    ),
  }),
);
adminRoutes.get("/financial", async (c) =>
  c.json({
    movements: await new AdminRepository(c.env.DB).financial(
      c.get("sessionUser").businessId,
      c.req.query("search"),
    ),
  }),
);
adminRoutes.post("/financial", zValidator("json", financial), async (c) => {
  const u = c.get("sessionUser");
  try {
    return c.json(
      {
        id: await new AdminRepository(c.env.DB).saveFinancial(
          u.businessId,
          u.id,
          null,
          c.req.valid("json"),
        ),
      },
      201,
    );
  } catch (error) {
    const message = moneyError(error);
    if (message) return c.json({ error: message }, 409);
    throw error;
  }
});
adminRoutes.put("/financial/:id", zValidator("json", financial), async (c) => {
  const u = c.get("sessionUser");
  try {
    const id = await new AdminRepository(c.env.DB).saveFinancial(
      u.businessId,
      u.id,
      c.req.param("id"),
      c.req.valid("json"),
    );
    return id
      ? c.json({ ok: true })
      : c.json({ error: "El movimiento automático no se puede editar" }, 409);
  } catch (error) {
    const message = moneyError(error);
    if (message) return c.json({ error: message }, 409);
    throw error;
  }
});
adminRoutes.get("/dashboard", async (c) =>
  c.json(
    await new AdminRepository(c.env.DB).dashboard(
      c.get("sessionUser").businessId,
      c.req.query("from"),
      c.req.query("to"),
      Number(c.req.query("timezoneOffsetMinutes") ?? 0),
    ),
  ),
);
