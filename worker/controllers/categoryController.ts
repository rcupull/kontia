import type { Context } from "hono";
import { CategoryRepository } from "../repositories/categoryRepository";
import type { Bindings, Variables } from "../types";

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

export async function listCategories(c: AppContext) {
  const categories = await new CategoryRepository(c.env.DB).list(
    c.get("sessionUser").businessId,
  );
  return c.json({ categories });
}

export async function createCategory(c: AppContext, name: string) {
  const category = await new CategoryRepository(c.env.DB).create(
    c.get("sessionUser").businessId,
    name,
  );
  return c.json({ category }, 201);
}
