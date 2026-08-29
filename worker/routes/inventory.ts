import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { InventoryRepository } from "../repositories/inventoryRepository";
import type { Bindings, Variables } from "../types";

export const inventoryRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();
const movementTypes = [
  "purchase",
  "customerReturn",
  "production",
  "inventoryInjection",
  "positiveAdjustment",
  "internalConsumption",
  "externalSale",
  "ownerWithdrawal",
  "waste",
  "negativeAdjustment",
  "transfer",
  "transformation",
  "disassembly",
  "disassemblyReturn",
] as const;
const input = z
  .object({
    productId: z.string().uuid(),
    batchId: z.string().uuid().optional(),
    sourceLocationId: z.string().uuid().optional(),
    destinationLocationId: z.string().uuid().optional(),
    movementType: z.enum(movementTypes),
    quantity: z.number().positive(),
    unitCostCents: z.number().int().positive().optional(),
    cashPriceCents: z.number().int().positive().optional(),
    cardPriceCents: z.number().int().positive().optional(),
    supplierInvoiceId: z.string().uuid().optional(),
    receivedAt: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.movementType === "externalSale" && !value.notes?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Indica el canal externo y la referencia del pedido",
      });
    }
  });
const batchInput = z.object({
  receivedAt: z.string().datetime({ offset: true }),
  unitCostCents: z.number().int().nonnegative(),
  cashPriceCents: z.number().int().nonnegative(),
  cardPriceCents: z.number().int().nonnegative(),
  supplierInvoiceId: z.string().uuid().nullable(),
});

inventoryRoutes.get("/batches", async (c) =>
  c.json({
    batches: await new InventoryRepository(c.env.DB).listBatches(
      c.get("sessionUser").businessId,
      c.req.query("search"),
    ),
  }),
);
inventoryRoutes.get("/movements", async (c) =>
  c.json({
    movements: await new InventoryRepository(c.env.DB).listMovements(
      c.get("sessionUser").businessId,
      c.req.query("search"),
    ),
  }),
);
inventoryRoutes.put(
  "/batches/:id",
  zValidator("json", batchInput),
  async (c) => {
    try {
      const updated = await new InventoryRepository(c.env.DB).updateBatch(
        c.get("sessionUser").businessId,
        c.req.param("id"),
        c.req.valid("json"),
      );
      return updated
        ? c.json({ ok: true })
        : c.json({ error: "Lote no encontrado" }, 404);
    } catch (error) {
      if (error instanceof Error && error.message === "INVOICE_NOT_FOUND")
        return c.json({ error: "Factura no encontrada" }, 404);
      throw error;
    }
  },
);
inventoryRoutes.post("/movements", zValidator("json", input), async (c) => {
  const user = c.get("sessionUser");
  try {
    return c.json(
      await new InventoryRepository(c.env.DB).createMovement({
        ...c.req.valid("json"),
        businessId: user.businessId,
        userId: user.id,
      }),
      201,
    );
  } catch (error) {
    const messages: Record<string, string> = {
      PRODUCT_NOT_FOUND: "Producto no encontrado",
      BATCH_REQUIRED: "Selecciona un lote",
      BATCH_NOT_FOUND: "Lote no encontrado",
      NEGATIVE_STOCK: "El movimiento dejaría el lote con existencia negativa",
      SOURCE_LOCATION_REQUIRED: "Selecciona una ubicación de origen válida",
      DESTINATION_LOCATION_REQUIRED:
        "Selecciona una ubicación de destino válida",
      PRODUCTION_LOCATIONS_REQUIRED:
        "Selecciona las ubicaciones de consumo y producción",
      SAME_LOCATION: "El origen y el destino deben ser diferentes",
      BATCH_PRICES_REQUIRED:
        "Costo y precios son obligatorios para crear un lote",
      INVOICE_NOT_FOUND: "Factura no encontrada",
      COMPOSITE_REQUIRED: "Selecciona un producto compuesto",
      COMPOSITION_REQUIRED: "El producto no tiene una composición definida",
      INTEGER_QUANTITY_REQUIRED:
        "Producción y desarme requieren unidades enteras",
      INSUFFICIENT_COMPONENT_STOCK:
        "No hay componentes suficientes para producir",
      PRODUCTION_NOT_FOUND: "El lote no proviene de una producción",
      INVALID_MOVEMENT_TYPE: "Tipo de movimiento inválido",
    };
    if (error instanceof Error && messages[error.message])
      return c.json({ error: messages[error.message] }, 409);
    throw error;
  }
});
