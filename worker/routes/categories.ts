import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createCategory, listCategories } from "../controllers/categoryController";
import type { Bindings, Variables } from "../types";

export const categoryRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

categoryRoutes.get("/", listCategories);
categoryRoutes.post("/", zValidator("json", z.object({ name: z.string().trim().min(2).max(80) })),
  (c) => createCategory(c, c.req.valid("json").name));
