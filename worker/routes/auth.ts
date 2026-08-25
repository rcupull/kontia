import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { clearSession, createSession, optionalSession } from "../auth/session";
import { hashPassword, verifyPassword } from "../auth/password";
import type { Bindings, Variables } from "../types";

export const authRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

authRoutes.get("/setup/status", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM users",
  ).first<{ count: number }>();
  return c.json({ required: Number(row?.count ?? 0) === 0 });
});

authRoutes.post(
  "/setup",
  zValidator(
    "json",
    z.object({
      bootstrapSecret: z.string().min(1),
      businessName: z.string().trim().min(2).max(80),
      username: z.string().trim().min(3).max(40),
      displayName: z.string().trim().min(2).max(80),
      password: z.string().min(10).max(128),
    }),
  ),
  async (c) => {
    const input = c.req.valid("json");
    if (input.bootstrapSecret !== c.env.BOOTSTRAP_SECRET)
      return c.json({ error: "Código de configuración inválido" }, 403);
    const count = await c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM users",
    ).first<{ count: number }>();
    if (Number(count?.count ?? 0) > 0)
      return c.json({ error: "Kontia ya fue configurado" }, 409);

    const businessId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const warehouseId = crypto.randomUUID();
    const pointOfSaleId = crypto.randomUUID();
    const password = await hashPassword(input.password);
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO businesses (id, name) VALUES (?, ?)").bind(
        businessId,
        input.businessName,
      ),
      c.env.DB.prepare(
        `INSERT INTO business_currencies (business_id,currency_code) VALUES (?,'CUP')`,
      ).bind(businessId),
      c.env.DB.prepare(
        `INSERT INTO money_accounts (id,business_id,name,account_type,currency_code)
         VALUES (?,?,'Efectivo CUP','cashDrawer','CUP')`,
      ).bind(`default-cash-${businessId}-CUP`, businessId),
      c.env.DB.prepare(
        `INSERT INTO money_accounts (id,business_id,name,account_type,currency_code)
         VALUES (?,?,'Cuenta bancaria CUP','bankAccount','CUP')`,
      ).bind(`default-bank-${businessId}-CUP`, businessId),
      c.env.DB.prepare(
        `INSERT INTO users
        (id, business_id, username, display_name, password_hash, password_salt, role)
        VALUES (?, ?, ?, ?, ?, ?, 'owner')`,
      ).bind(
        userId,
        businessId,
        input.username,
        input.displayName,
        password.hash,
        password.salt,
      ),
      c.env.DB.prepare(
        `INSERT INTO locations (id,business_id,code,name,type) VALUES (?,?,'ALM-01','Almacén principal','warehouse')`,
      ).bind(warehouseId, businessId),
      c.env.DB.prepare(
        `INSERT INTO locations (id,business_id,code,name,type) VALUES (?,?,'POS-01','Punto de venta principal','point_of_sale')`,
      ).bind(pointOfSaleId, businessId),
    ]);
    const user = {
      id: userId,
      businessId,
      displayName: input.displayName,
      role: "owner" as const,
    };
    await createSession(c, user);
    return c.json({ user }, 201);
  },
);

authRoutes.post(
  "/login",
  zValidator(
    "json",
    z.object({
      username: z.string().trim().min(1),
      password: z.string().min(1),
    }),
  ),
  async (c) => {
    const input = c.req.valid("json");
    const user = await c.env.DB.prepare(
      `SELECT id, business_id, display_name, role, password_hash, password_salt
      FROM users WHERE username = ? COLLATE NOCASE AND is_active = 1 LIMIT 1`,
    )
      .bind(input.username)
      .first<Record<string, string>>();
    if (
      !user ||
      !(await verifyPassword(
        input.password,
        user.password_hash,
        user.password_salt,
      ))
    ) {
      return c.json({ error: "Usuario o contraseña inválidos" }, 401);
    }
    const sessionUser = {
      id: user.id,
      businessId: user.business_id,
      displayName: user.display_name,
      role: user.role as "owner" | "manager" | "seller",
    };
    await createSession(c, sessionUser);
    return c.json({ user: sessionUser });
  },
);

authRoutes.post("/logout", (c) => {
  clearSession(c);
  return c.json({ ok: true });
});
authRoutes.get("/session", async (c) =>
  c.json({ user: await optionalSession(c) }),
);
