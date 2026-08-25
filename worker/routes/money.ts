import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { MoneyRepository } from "../repositories/moneyRepository";
import type { Bindings, Variables } from "../types";

export const moneyRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

export const monetaryComponentSchema = z.object({
  moneyAccountId: z.string().min(1),
  paymentMethod: z.enum(["cash", "card", "transfer"]),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  amountMinor: z.number().int().positive(),
  exchangeRateScaled: z.number().int().positive(),
  baseAmountCents: z.number().int().positive(),
});

const errors: Record<string, string> = {
  PAYMENTS_REQUIRED: "Agrega al menos un componente monetario",
  PAYMENT_TOTAL_MISMATCH: "Los componentes no cubren el total de la operación",
  INVALID_PAYMENT: "El componente monetario no es válido",
  MONEY_ACCOUNT_NOT_FOUND:
    "La cuenta monetaria no existe o no corresponde a la moneda",
  CURRENCY_NOT_ACCEPTED: "La moneda no está habilitada para el negocio",
  EXCHANGE_CURRENCIES_MUST_DIFFER: "Selecciona dos monedas diferentes",
  EXCHANGE_BASE_CURRENCY_REQUIRED:
    "Uno de los lados del cambio debe usar la moneda base",
  EXCHANGE_TOTAL_MISMATCH:
    "La entrada y la salida no tienen el mismo valor base",
  INSUFFICIENT_CURRENCY_BALANCE:
    "No hay saldo suficiente de la moneda entregada",
};

export function moneyError(error: unknown) {
  return error instanceof Error ? errors[error.message] : undefined;
}

moneyRoutes.get("/settings", async (c) =>
  c.json(
    await new MoneyRepository(c.env.DB).settings(
      c.get("sessionUser").businessId,
    ),
  ),
);

moneyRoutes.put(
  "/currencies",
  zValidator(
    "json",
    z.object({
      currencyCodes: z.array(z.string().regex(/^[A-Z]{3}$/)).max(12),
    }),
  ),
  async (c) => {
    const user = c.get("sessionUser");
    if (user.role !== "owner")
      return c.json(
        { error: "Solo el propietario puede configurar monedas" },
        403,
      );
    await new MoneyRepository(c.env.DB).configureCurrencies(
      user.businessId,
      c.req.valid("json").currencyCodes,
    );
    return c.json({ ok: true });
  },
);

moneyRoutes.get("/exchanges", async (c) =>
  c.json({
    exchanges: await new MoneyRepository(c.env.DB).exchanges(
      c.get("sessionUser").businessId,
    ),
  }),
);

moneyRoutes.post(
  "/exchanges",
  zValidator(
    "json",
    z.object({
      exchangeDate: z.string().datetime({ offset: true }),
      notes: z.string().trim().max(500).optional(),
      cashSessionId: z.string().uuid().optional(),
      source: monetaryComponentSchema,
      target: monetaryComponentSchema,
    }),
  ),
  async (c) => {
    const user = c.get("sessionUser");
    try {
      return c.json(
        {
          id: await new MoneyRepository(c.env.DB).exchange(
            user.businessId,
            user.id,
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
  },
);
