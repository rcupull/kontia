import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  createCategory,
  listCategories,
  updateCategory,
} from "../controllers/categoryController";
import type { Bindings, Variables } from "../types";

export const categoryRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

categoryRoutes.get("/", listCategories);
const input = z.object({
  name: z.string().trim().min(2).max(80),
  icon: z.string().trim().min(1).max(16),
});
categoryRoutes.post("/", zValidator("json", input), (c) => {
  const values = c.req.valid("json");
  return createCategory(c, values.name, values.icon);
});
categoryRoutes.put("/:id", zValidator("json", input), (c) => {
  const values = c.req.valid("json");
  return updateCategory(c, c.req.param("id"), values.name, values.icon);
});
