import { Hono } from "hono";
import { authRoutes } from "./routes/auth";
import { productRoutes } from "./routes/products";
import { categoryRoutes } from "./routes/categories";
import { requireSession } from "./auth/session";
import { getImage, uploadImage } from "./controllers/imageController";
import type { Bindings, Variables } from "./types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.onError((error, c) => {
  console.error("Request failed", error);
  return c.json({ error: "No pudimos completar la solicitud" }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRoutes);
app.get("/media/:key", getImage);
app.use("/api/products*", requireSession);
app.use("/api/categories*", requireSession);
app.use("/api/images*", requireSession);
app.route("/api/products", productRoutes);
app.route("/api/categories", categoryRoutes);
app.post("/api/images", uploadImage);

export default app;
