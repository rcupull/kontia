import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { InvestorPortalRepository } from "../repositories/investorPortalRepository";

export const investorPortalRoutes = new Hono<{
  Bindings: Bindings;
  Variables: Variables;
}>();
investorPortalRoutes.get("/me", async (c) => {
  const user = c.get("sessionUser");
  try {
    return c.json(
      await new InvestorPortalRepository(c.env.DB).mine(
        user.businessId,
        user.id,
      ),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INVESTOR_ACCESS_NOT_FOUND")
      return c.json(
        { error: "Este usuario no está vinculado a un inversor" },
        403,
      );
    throw error;
  }
});
