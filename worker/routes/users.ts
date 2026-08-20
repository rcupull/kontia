import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { UserRepository } from "../repositories/userRepository";
import type { Bindings, Variables } from "../types";

export const userRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();
const base = z.object({
  username: z.string().trim().min(3).max(40),
  displayName: z.string().trim().min(2).max(80),
  role: z.enum(["manager", "seller"]),
});
const requireOwner = (c: {
  get(name: "sessionUser"): Variables["sessionUser"];
}) => c.get("sessionUser").role === "owner";
const errorResponse = (c: any, reason: unknown) => {
  const message = reason instanceof Error ? reason.message : "";
  if (message === "USERNAME_EXISTS")
    return c.json({ error: "Ese nombre de usuario ya está en uso" }, 409);
  if (message === "OWNER_PROTECTED")
    return c.json({ error: "El propietario principal está protegido" }, 409);
  if (message === "USER_NOT_FOUND")
    return c.json({ error: "Usuario no encontrado" }, 404);
  throw reason;
};

userRoutes.use("*", async (c, next) => {
  if (!requireOwner(c))
    return c.json(
      { error: "Solo el propietario puede administrar usuarios" },
      403,
    );
  await next();
});
userRoutes.get("/", async (c) =>
  c.json({
    users: await new UserRepository(c.env.DB).list(
      c.get("sessionUser").businessId,
      c.req.query("search"),
    ),
  }),
);
userRoutes.post(
  "/",
  zValidator("json", base.extend({ password: z.string().min(10).max(128) })),
  async (c) => {
    try {
      const id = await new UserRepository(c.env.DB).create(
        c.get("sessionUser").businessId,
        c.req.valid("json"),
      );
      return c.json({ id }, 201);
    } catch (reason) {
      return errorResponse(c, reason);
    }
  },
);
userRoutes.put(
  "/:id",
  zValidator(
    "json",
    base.extend({
      password: z.string().min(10).max(128).optional(),
      isActive: z.boolean(),
    }),
  ),
  async (c) => {
    try {
      await new UserRepository(c.env.DB).update(
        c.get("sessionUser").businessId,
        c.req.param("id"),
        c.req.valid("json"),
      );
      return c.json({ ok: true });
    } catch (reason) {
      return errorResponse(c, reason);
    }
  },
);
