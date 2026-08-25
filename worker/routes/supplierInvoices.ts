import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { SupplierInvoiceRepository } from "../repositories/supplierInvoiceRepository";
import type { Bindings, Variables } from "../types";
import { monetaryComponentSchema, moneyError } from "./money";

export const supplierInvoiceRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();
const input = z.object({
  supplierId: z.string().uuid(),
  invoiceNumber: z.string().trim().min(1).max(80),
  invoiceDate: z.string().date(),
  totalAmountCents: z.number().int().min(0),
  notes: z.string().trim().max(500).optional(),
});

supplierInvoiceRoutes.get("/", async (c) =>
  c.json({
    invoices: await new SupplierInvoiceRepository(c.env.DB).list(
      c.get("sessionUser").businessId,
      c.req.query("search"),
    ),
  }),
);
supplierInvoiceRoutes.get("/:id/reconciliation", async (c) => {
  const movements = await new SupplierInvoiceRepository(
    c.env.DB,
  ).reconciliation(c.get("sessionUser").businessId, c.req.param("id"));
  return movements
    ? c.json({ movements })
    : c.json({ error: "Factura no encontrada" }, 404);
});
supplierInvoiceRoutes.post("/", zValidator("json", input), async (c) => {
  try {
    const id = await new SupplierInvoiceRepository(c.env.DB).create(
      c.get("sessionUser").businessId,
      c.req.valid("json"),
    );
    return c.json({ id }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "SUPPLIER_NOT_FOUND")
      return c.json({ error: "Proveedor no encontrado" }, 404);
    throw error;
  }
});
supplierInvoiceRoutes.put("/:id", zValidator("json", input), async (c) => {
  try {
    const updated = await new SupplierInvoiceRepository(c.env.DB).update(
      c.get("sessionUser").businessId,
      c.req.param("id"),
      c.req.valid("json"),
    );
    return updated
      ? c.json({ ok: true })
      : c.json({ error: "Factura no encontrada" }, 404);
  } catch (error) {
    if (error instanceof Error && error.message === "SUPPLIER_NOT_FOUND")
      return c.json({ error: "Proveedor no encontrado" }, 404);
    throw error;
  }
});

supplierInvoiceRoutes.post(
  "/:id/payments",
  zValidator(
    "json",
    z.object({
      paymentDate: z.string().datetime({ offset: true }),
      components: z.array(monetaryComponentSchema).min(1).max(12),
    }),
  ),
  async (c) => {
    const user = c.get("sessionUser");
    try {
      const pendingAmountCents = await new SupplierInvoiceRepository(
        c.env.DB,
      ).addPayment(
        user.businessId,
        user.id,
        c.req.param("id"),
        c.req.valid("json").paymentDate,
        c.req.valid("json").components,
      );
      return c.json({ pendingAmountCents }, 201);
    } catch (error) {
      if (error instanceof Error && error.message === "INVOICE_NOT_FOUND")
        return c.json({ error: "Factura no encontrada" }, 404);
      if (error instanceof Error && error.message === "PAYMENT_EXCEEDS_BALANCE")
        return c.json({ error: "El pago excede el saldo pendiente" }, 409);
      const message = moneyError(error);
      if (message) return c.json({ error: message }, 409);
      throw error;
    }
  },
);
