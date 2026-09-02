import { Hono } from "hono";
import { authRoutes } from "./routes/auth";
import { productRoutes } from "./routes/products";
import { categoryRoutes } from "./routes/categories";
import { supplierRoutes } from "./routes/suppliers";
import { supplierInvoiceRoutes } from "./routes/supplierInvoices";
import { inventoryRoutes } from "./routes/inventory";
import { locationRoutes } from "./routes/locations";
import { maintenanceRoutes } from "./routes/maintenance";
import { adminRoutes } from "./routes/admin";
import { posRoutes } from "./routes/pos";
import { userRoutes } from "./routes/users";
import { businessRoutes } from "./routes/businesses";
import { moneyRoutes } from "./routes/money";
import { externalRoutes } from "./routes/external";
import { requireSession } from "./auth/session";
import { getImage, uploadImage } from "./controllers/imageController";
import type { Bindings, Variables } from "./types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.onError((error, c) => {
  console.error("Request failed", {
    operation: `${c.req.method} ${new URL(c.req.url).pathname}`,
    error: error.message,
    cause: error.cause == null ? undefined : String(error.cause),
  });
  return c.json({ error: "No pudimos completar la solicitud" }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true, version: __APP_VERSION__ }));
app.route("/api/auth", authRoutes);
app.route("/api/external", externalRoutes);
app.get("/media/:key", getImage);
for (const resource of [
  "products",
  "categories",
  "images",
  "suppliers",
  "supplier-invoices",
  "inventory",
  "locations",
  "maintenance",
  "admin-data",
  "pos",
  "users",
  "businesses",
  "money",
]) {
  app.use(`/api/${resource}`, requireSession);
  app.use(`/api/${resource}/*`, requireSession);
}
app.route("/api/products", productRoutes);
app.route("/api/categories", categoryRoutes);
app.post("/api/images", uploadImage);
app.route("/api/suppliers", supplierRoutes);
app.route("/api/supplier-invoices", supplierInvoiceRoutes);
app.route("/api/inventory", inventoryRoutes);
app.route("/api/locations", locationRoutes);
app.route("/api/maintenance", maintenanceRoutes);
app.route("/api/admin-data", adminRoutes);
app.route("/api/pos", posRoutes);
app.route("/api/users", userRoutes);
app.route("/api/businesses", businessRoutes);
app.route("/api/money", moneyRoutes);

export default app;
