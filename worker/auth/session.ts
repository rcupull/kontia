import type { Context, Next } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Bindings, SessionUser, Variables } from "../types";

const encoder = new TextEncoder();
const COOKIE = "kontia_session";
const MAX_AGE = 60 * 60 * 12;
const ABSOLUTE_MAX_AGE = 60 * 60 * 24 * 30;
const RENEW_WHEN_LESS_THAN = MAX_AGE / 2;

type SessionPayload = SessionUser & {
  exp: number;
  issuedAt?: number;
  absoluteExp?: number;
};

type ValidSession = {
  user: SessionUser;
  exp: number;
  issuedAt: number;
  absoluteExp: number;
};

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

async function writeSession(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  user: SessionUser,
  issuedAt: number,
  absoluteExp: number,
) {
  const now = Math.floor(Date.now() / 1000);
  const exp = Math.min(now + MAX_AGE, absoluteExp);
  const payload = encode(
    JSON.stringify({ ...user, exp, issuedAt, absoluteExp }),
  );
  const signature = await sign(payload, c.env.SESSION_SECRET);
  setCookie(c, COOKIE, `${payload}.${signature}`, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: Math.max(0, exp - now),
  });
}

export async function createSession(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  user: SessionUser,
) {
  const now = Math.floor(Date.now() / 1000);
  await writeSession(c, user, now, now + ABSOLUTE_MAX_AGE);
}

export function clearSession(c: Context) {
  deleteCookie(c, COOKIE, { path: "/" });
}

async function readSession(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
): Promise<ValidSession | null> {
  const [payload, signature] = (getCookie(c, COOKIE) ?? "").split(".");
  if (
    !payload ||
    !signature ||
    (await sign(payload, c.env.SESSION_SECRET)) !== signature
  )
    return null;
  try {
    const json = atob(payload.replaceAll("-", "+").replaceAll("_", "/"));
    const data = JSON.parse(json) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    const issuedAt = data.issuedAt ?? data.exp - MAX_AGE;
    const absoluteExp = data.absoluteExp ?? issuedAt + ABSOLUTE_MAX_AGE;
    if (data.exp <= now || absoluteExp <= now) return null;
    const user = await c.env.DB.prepare(
      `SELECT u.id,u.business_id AS businessId,
        u.display_name AS displayName,u.role
      FROM users u JOIN businesses b ON b.id=u.business_id
      WHERE u.id=? AND u.business_id=? AND u.is_active=1 AND b.is_active=1`,
    )
      .bind(data.id, data.businessId)
      .first<SessionUser>();
    return user ? { user, exp: data.exp, issuedAt, absoluteExp } : null;
  } catch {
    return null;
  }
}

async function renewSession(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  session: ValidSession,
) {
  const now = Math.floor(Date.now() / 1000);
  if (session.exp - now > RENEW_WHEN_LESS_THAN) return;
  await writeSession(c, session.user, session.issuedAt, session.absoluteExp);
}

export async function requireSession(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next,
) {
  const session = await readSession(c);
  if (!session) return c.json({ error: "Sesión no autorizada" }, 401);
  await renewSession(c, session);
  c.set("sessionUser", session.user);
  await next();
}

export async function optionalSession(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
) {
  const session = await readSession(c);
  if (!session) return null;
  await renewSession(c, session);
  return session.user;
}
