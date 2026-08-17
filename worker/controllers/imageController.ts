import type { Context } from "hono";
import { ImageRepository } from "../repositories/imageRepository";
import type { Bindings, Variables } from "../types";

const MAX_IMAGE_SIZE = 600_000;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export async function getImage(c: Context<{ Bindings: Bindings }>) {
  const key = c.req.param("key");
  if (!key) return c.notFound();
  const image = await new ImageRepository(c.env.DB).find(key);
  if (!image) return c.notFound();
  const bytes = Uint8Array.from(image.data);
  if (bytes.byteLength !== image.size_bytes) return c.json({ error: "La imagen almacenada no es válida" }, 500);
  return new Response(bytes.buffer, { headers: {
    "Content-Type": image.content_type,
    "Content-Length": String(image.size_bytes),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  }});
}

export async function uploadImage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  const data = await c.req.formData();
  const file = data.get("file");
  if (!(file instanceof File)) return c.json({ error: "Selecciona una imagen" }, 400);
  if (!allowedTypes.has(file.type)) return c.json({ error: "Usa una imagen JPG, PNG, WebP o AVIF" }, 400);
  if (file.size > MAX_IMAGE_SIZE) return c.json({ error: "La imagen optimizada no puede superar 600 KB" }, 400);
  const id = await new ImageRepository(c.env.DB).create(c.get("sessionUser").businessId, file.type, await file.arrayBuffer());
  return c.json({ id, imageUrl: `/media/${id}` }, 201);
}
