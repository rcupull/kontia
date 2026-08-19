const encoder = new TextEncoder();
const ITERATIONS = 100_000;
const LEGACY_ITERATIONS = 210_000;
const HASH_PREFIX = "pbkdf2-sha256";

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      material,
      256,
    ),
  );
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = toBase64(await derive(password, salt, ITERATIONS));
  return { hash: `${HASH_PREFIX}$${ITERATIONS}$${hash}`, salt: toBase64(salt) };
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
) {
  const parts = hash.split("$");
  const versioned = parts.length === 3 && parts[0] === HASH_PREFIX;
  const iterations = versioned ? Number(parts[1]) : LEGACY_ITERATIONS;
  const encodedHash = versioned ? parts[2] : hash;
  if (
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    (iterations > ITERATIONS && versioned)
  )
    return false;
  let actual: Uint8Array;
  try {
    actual = await derive(password, fromBase64(salt), iterations);
  } catch {
    return false;
  }
  const expected = fromBase64(encodedHash);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expected[index];
  }
  return difference === 0;
}
