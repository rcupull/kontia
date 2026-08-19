import type { Context, Next } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Bindings, SessionUser, Variables } from "../types";

const encoder = new TextEncoder();
const COOKIE = "kontia_session";
const MAX_AGE = 60 * 60 * 12;

function encode(value: string | ArrayBuffer) {
  const bytes =
    typeof value === "string" ? encoder.encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return encode(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function createSession(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  user: SessionUser,
) {
  const payload = encode(
    JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + MAX_AGE }),
  );
  const signature = await sign(payload, c.env.SESSION_SECRET);
  setCookie(c, COOKIE, `${payload}.${signature}`, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSession(c: Context) {
  deleteCookie(c, COOKIE, { path: "/" });
}

async function readSession(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<SessionUser | null> {
  const [payload, signature] = (getCookie(c, COOKIE) ?? "").split(".");
  if (
    !payload ||
    !signature ||
    (await sign(payload, c.env.SESSION_SECRET)) !== signature
  )
    return null;
  try {
    const json = atob(payload.replaceAll("-", "+").replaceAll("_", "/"));
    const data = JSON.parse(json) as SessionUser & { exp: number };
    if (data.exp <= Date.now() / 1000) return null;
    const user = await c.env.DB.prepare(
      `SELECT u.id,u.business_id AS businessId,
        u.display_name AS displayName,u.role
      FROM users u JOIN businesses b ON b.id=u.business_id
      WHERE u.id=? AND u.business_id=? AND u.is_active=1 AND b.is_active=1`,
    )
      .bind(data.id, data.businessId)
      .first<SessionUser>();
    return user ?? null;
  } catch {
    return null;
  }
}

export async function requireSession(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next,
) {
  const user = await readSession(c);
  if (!user) return c.json({ error: "Sesión no autorizada" }, 401);
  c.set("sessionUser", user);
  await next();
}

export async function optionalSession(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
) {
  return readSession(c);
}
