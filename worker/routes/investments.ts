import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { InvestmentRepository } from "../repositories/investmentRepository";
import { monetaryComponentSchema, moneyError } from "./money";

export const investmentRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();
const ownerOnly = async (c: any, next: () => Promise<void>) => {
  if (c.get("sessionUser").role !== "owner")
    return c.json(
      { error: "Solo el propietario puede administrar inversiones" },
      403,
    );
  await next();
};
investmentRoutes.use("/*", ownerOnly);

const errors: Record<string, string> = {
  INVESTOR_NOT_FOUND: "El inversor no existe o está inactivo",
  VALUATION_REQUIRED: "Indica el valor del negocio antes de este aporte",
  INVALID_UNITS: "El aporte es demasiado pequeño para generar participación",
  NO_OWNERSHIP: "Primero registra el capital inicial de los fundadores",
  INVALID_VALUATION:
    "El patrimonio actual debe ser positivo para retirar capital",
  WITHDRAWAL_EXCEEDS_POSITION:
    "El retiro supera el valor patrimonial del inversor",
  RECLASSIFICATION_SOURCE_NOT_FOUND:
    "El aporte o componente monetario ya no está disponible",
  RECLASSIFICATION_EXCEEDS_COMPONENT:
    "El activo supera el saldo monetario del componente seleccionado",
  INVALID_RECLASSIFICATION_ROUNDING:
    "El valor es demasiado pequeño para reclasificarlo en esa moneda",
  RECLASSIFICATION_INVESTOR_REQUIRED:
    "Selecciona el inversor al que pertenece el activo",
};
const handle = (error: unknown) =>
  moneyError(error) ??
  (error instanceof Error ? errors[error.message] : undefined);

investmentRoutes.get("/", async (c) =>
  c.json(
    await new InvestmentRepository(c.env.DB).summary(
      c.get("sessionUser").businessId,
    ),
  ),
);
investmentRoutes.post(
  "/investors",
  zValidator(
    "json",
    z.object({
      name: z.string().trim().min(1).max(120),
      notes: z.string().trim().max(500).optional(),
    }),
  ),
  async (c) => {
    const id = await new InvestmentRepository(c.env.DB).createInvestor(
      c.get("sessionUser").businessId,
      c.req.valid("json"),
    );
    return c.json({ id }, 201);
  },
);
investmentRoutes.patch(
  "/investors/:id/status",
  zValidator("json", z.object({ isActive: z.boolean() })),
  async (c) => {
    const ok = await new InvestmentRepository(c.env.DB).setInvestorStatus(
      c.get("sessionUser").businessId,
      c.req.param("id"),
      c.req.valid("json").isActive,
    );
    return ok
      ? c.json({ ok: true })
      : c.json({ error: "Inversor no encontrado" }, 404);
  },
);
investmentRoutes.post(
  "/contributions",
  zValidator(
    "json",
    z.object({
      investorId: z.string().min(1),
      amountCents: z.number().int().positive(),
      preMoneyValuationCents: z.number().int().positive().optional(),
      entryDate: z.string().datetime({ offset: true }),
      notes: z.string().trim().max(500).optional(),
      affectsCash: z.boolean(),
      components: z.array(monetaryComponentSchema).max(12).optional(),
    }),
  ),
  async (c) => {
    const u = c.get("sessionUser");
    try {
      const id = await new InvestmentRepository(c.env.DB).contribute(
        u.businessId,
        u.id,
        c.req.valid("json"),
      );
      return c.json({ id }, 201);
    } catch (error) {
      const message = handle(error);
      if (message) return c.json({ error: message }, 409);
      throw error;
    }
  },
);
investmentRoutes.post(
  "/distributions",
  zValidator(
    "json",
    z.object({
      amountCents: z.number().int().positive(),
      entryDate: z.string().datetime({ offset: true }),
      notes: z.string().trim().max(500).optional(),
      components: z.array(monetaryComponentSchema).min(1).max(12),
    }),
  ),
  async (c) => {
    const u = c.get("sessionUser");
    try {
      return c.json(
        await new InvestmentRepository(c.env.DB).distribute(
          u.businessId,
          u.id,
          c.req.valid("json"),
        ),
        201,
      );
    } catch (error) {
      const message = handle(error);
      if (message) return c.json({ error: message }, 409);
      throw error;
    }
  },
);
investmentRoutes.post(
  "/withdrawals",
  zValidator(
    "json",
    z.object({
      investorId: z.string().min(1),
      amountCents: z.number().int().positive(),
      entryDate: z.string().datetime({ offset: true }),
      notes: z.string().trim().max(500).optional(),
      components: z.array(monetaryComponentSchema).min(1).max(12),
    }),
  ),
  async (c) => {
    const u = c.get("sessionUser");
    try {
      return c.json(
        await new InvestmentRepository(c.env.DB).withdrawCapital(
          u.businessId,
          u.id,
          c.req.valid("json"),
        ),
        201,
      );
    } catch (error) {
      const message = handle(error);
      if (message) return c.json({ error: message }, 409);
      throw error;
    }
  },
);
investmentRoutes.get("/fixed-assets", async (c) =>
  c.json({
    assets: await new InvestmentRepository(c.env.DB).fixedAssets(
      c.get("sessionUser").businessId,
    ),
  }),
);
investmentRoutes.get("/reclassifiable-contributions", async (c) =>
  c.json({
    contributions: await new InvestmentRepository(
      c.env.DB,
    ).reclassifiableContributions(c.get("sessionUser").businessId),
  }),
);
investmentRoutes.post(
  "/fixed-assets/reclassifications",
  zValidator(
    "json",
    z.object({
      investmentEntryId: z.string().min(1).optional(),
      financialMovementId: z.string().min(1),
      investorId: z.string().min(1).optional(),
      monetaryComponentId: z.string().min(1),
      name: z.string().trim().min(1).max(150),
      category: z.string().trim().min(1).max(80),
      description: z.string().trim().max(500).optional(),
      acquisitionDate: z.string().min(1),
      valueCents: z.number().int().positive(),
    }),
  ),
  async (c) => {
    const u = c.get("sessionUser");
    try {
      return c.json(
        await new InvestmentRepository(c.env.DB).reclassifyFixedAsset(
          u.businessId,
          u.id,
          c.req.valid("json"),
        ),
        201,
      );
    } catch (error) {
      const message = handle(error);
      if (message) return c.json({ error: message }, 409);
      throw error;
    }
  },
);
